using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;

// Runner-local stdio helper only. It binds the provider tree to one Job Object
// before forwarding any provider input; it deliberately has no network listener.
internal static class Program
{
    private const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;

    private sealed class Launch
    {
        public required string Executable { get; init; }
        public required string[] Args { get; init; }
        public required string Cwd { get; init; }
        public required Dictionary<string, string> Env { get; init; }
    }

    public static async Task<int> Main()
    {
        var input = Console.OpenStandardInput();
        var line = await ReadFirstLine(input);
        if (string.IsNullOrWhiteSpace(line)) return 64;
        Launch? launch;
        try
        {
            launch = JsonSerializer.Deserialize<Launch>(line, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = false,
                UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
            });
        }
        catch (JsonException) { return 64; }
        if (launch is null || string.IsNullOrWhiteSpace(launch.Executable) || string.IsNullOrWhiteSpace(launch.Cwd)) return 64;

        using var job = CreateKillOnCloseJob();
        using var process = new Process { StartInfo = StartInfo(launch) };
        if (!process.Start()) return 70;
        if (!AssignProcessToJobObject(job, process.Handle)) return 70;

        var stdout = process.StandardOutput.BaseStream.CopyToAsync(Console.OpenStandardOutput());
        var stderr = process.StandardError.BaseStream.CopyToAsync(Console.OpenStandardError());
        using var stdinCancellation = new CancellationTokenSource();
        var stdinForward = input.CopyToAsync(process.StandardInput.BaseStream, stdinCancellation.Token);
        var providerExit = process.WaitForExitAsync();
        var completed = await Task.WhenAny(stdinForward, providerExit);
        if (completed == providerExit)
        {
            // A normally exiting provider must not wait indefinitely for the Runner's still-open control pipe.
            stdinCancellation.Cancel();
            process.StandardInput.Close();
            // A surviving descendant may still hold stdout/stderr; kill-on-close must run before drain awaits.
            job.Dispose();
            ObserveFault(stdinForward);
        }
        else
        {
            // EOF or a local control-pipe failure means this Runner no longer owns the provider tree.
            try { await stdinForward; }
            catch { }
            process.StandardInput.Close();
            job.Dispose();
            await providerExit;
        }
        await Task.WhenAll(stdout, stderr);
        return process.ExitCode;
    }

    private static ProcessStartInfo StartInfo(Launch launch)
    {
        var info = new ProcessStartInfo
        {
            FileName = launch.Executable,
            WorkingDirectory = launch.Cwd,
            UseShellExecute = false,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
        };
        // The only environment accepted by the helper is the structured Runner-built overlay.
        info.Environment.Clear();
        foreach (var argument in launch.Args) info.ArgumentList.Add(argument);
        foreach (var (key, value) in launch.Env) info.Environment[key] = value;
        return info;
    }

    private static void ObserveFault(Task task)
    {
        _ = task.ContinueWith(
            completed => _ = completed.Exception,
            TaskContinuationOptions.OnlyOnFaulted | TaskContinuationOptions.ExecuteSynchronously);
    }

    private static async Task<string?> ReadFirstLine(Stream input)
    {
        var bytes = new List<byte>();
        var one = new byte[1];
        while (true)
        {
            var count = await input.ReadAsync(one);
            if (count == 0) return bytes.Count == 0 ? null : System.Text.Encoding.UTF8.GetString(bytes.ToArray());
            if (one[0] == (byte)'\n') return System.Text.Encoding.UTF8.GetString(bytes.ToArray()).TrimEnd('\r');
            if (bytes.Count >= 64 * 1024) return null;
            bytes.Add(one[0]);
        }
    }

    private static SafeJobHandle CreateKillOnCloseJob()
    {
        var job = CreateJobObject(IntPtr.Zero, null);
        if (job.IsInvalid) throw new InvalidOperationException("job_create_failed");
        var info = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        var size = Marshal.SizeOf<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>();
        var pointer = Marshal.AllocHGlobal(size);
        try
        {
            Marshal.StructureToPtr(info, pointer, false);
            if (!SetInformationJobObject(job, 9, pointer, (uint)size)) throw new InvalidOperationException("job_limit_failed");
            return job;
        }
        catch { job.Dispose(); throw; }
        finally { Marshal.FreeHGlobal(pointer); }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_BASIC_LIMIT_INFORMATION
    {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct IO_COUNTERS
    {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
    {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    private sealed class SafeJobHandle : SafeHandle
    {
        public SafeJobHandle() : base(IntPtr.Zero, true) { }
        public override bool IsInvalid => handle == IntPtr.Zero || handle == new IntPtr(-1);
        protected override bool ReleaseHandle() => CloseHandle(handle);
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeJobHandle CreateJobObject(IntPtr attributes, string? name);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetInformationJobObject(SafeJobHandle job, int infoClass, IntPtr info, uint length);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AssignProcessToJobObject(SafeJobHandle job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr handle);
}
