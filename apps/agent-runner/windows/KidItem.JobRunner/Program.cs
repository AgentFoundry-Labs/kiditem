using Microsoft.Win32.SafeHandles;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

// Runner-local stdio helper only. It never opens a listener and accepts one
// structured launch. The provider is created suspended, admitted to its
// kill-on-close Job, then resumed: there is no provider execution window before
// descendant ownership is established.
internal static class Program
{
    private const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;
    private const uint CREATE_SUSPENDED = 0x00000004;
    private const uint CREATE_UNICODE_ENVIRONMENT = 0x00000400;
    private const uint CREATE_NO_WINDOW = 0x08000000;
    private const uint STARTF_USESTDHANDLES = 0x00000100;
    private const uint HANDLE_FLAG_INHERIT = 0x00000001;
    private const uint INFINITE = 0xFFFFFFFF;
    private const uint WAIT_OBJECT_0 = 0;
    private const uint STILL_ACTIVE = 259;

    private sealed class Launch
    {
        [JsonPropertyName("executable")]
        public string? Executable { get; init; }
        [JsonPropertyName("args")]
        public string[]? Args { get; init; }
        [JsonPropertyName("cwd")]
        public string? Cwd { get; init; }
        [JsonPropertyName("env")]
        public Dictionary<string, string>? Env { get; init; }
    }

    private sealed class LaunchAdmissionException : Exception
    {
        public LaunchAdmissionException(string message) : base(message) { }
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
            ValidateLaunch(launch);
        }
        catch (JsonException) { return 64; }
        catch (LaunchAdmissionException) { return 64; }
        if (launch is null) return 64;

        SafeJobHandle? job = null;
        var jobClosed = false;
        void CloseJobOnce()
        {
            if (jobClosed || job is null) return;
            jobClosed = true;
            job.Dispose();
        }
        NativeProviderProcess? process = null;
        try
        {
            job = CreateKillOnCloseJob();
            process = CreateSuspendedProviderInJob(job, launch);
            var stdout = process.StandardOutput.CopyToAsync(Console.OpenStandardOutput());
            var stderr = process.StandardError.CopyToAsync(Console.OpenStandardError());
            using var stdinCancellation = new CancellationTokenSource();
            var stdinForward = input.CopyToAsync(process.StandardInput, stdinCancellation.Token);
            var providerExit = process.WaitForExitAsync();
            var completed = await Task.WhenAny(stdinForward, providerExit);
            if (completed == providerExit)
            {
                stdinCancellation.Cancel();
                process.StandardInput.Close();
                // A surviving descendant may still hold stdout/stderr; close the
                // Job before awaiting drains so its entire tree is killed.
                CloseJobOnce();
                ObserveFault(stdinForward);
            }
            else
            {
                try { await stdinForward; }
                catch { }
                process.StandardInput.Close();
                CloseJobOnce();
            }
            await providerExit;
            await Task.WhenAll(stdout, stderr);
            return process.ExitCode;
        }
        catch (LaunchAdmissionException)
        {
            return 70;
        }
        finally
        {
            // Every non-happy path closes the Job first and waits before any
            // native process handle can be released.
            CloseJobOnce();
            if (process is not null)
            {
                try { await process.WaitForExitAsync(); }
                catch { }
                process.Dispose();
            }
        }
    }

    private static NativeProviderProcess CreateSuspendedProviderInJob(SafeJobHandle job, Launch launch)
    {
        using var pipes = ProviderPipes.Create();
        SafeProcessHandle? process = null;
        SafeThreadHandle? thread = null;
        try
        {
            var startup = new STARTUPINFO
            {
                cb = Marshal.SizeOf<STARTUPINFO>(),
                dwFlags = STARTF_USESTDHANDLES,
                hStdInput = pipes.ChildStandardInput.DangerousGetHandle(),
                hStdOutput = pipes.ChildStandardOutput.DangerousGetHandle(),
                hStdError = pipes.ChildStandardError.DangerousGetHandle(),
            };
            var environment = BuildEnvironmentBlock(launch.Env!);
            var environmentPointer = Marshal.StringToHGlobalUni(environment);
            try
            {
                var commandLine = new StringBuilder(BuildCommandLine(launch.Executable!, launch.Args!));
                if (!CreateProcessW(
                    launch.Executable,
                    commandLine,
                    IntPtr.Zero,
                    IntPtr.Zero,
                    true,
                    CREATE_SUSPENDED | CREATE_UNICODE_ENVIRONMENT | CREATE_NO_WINDOW,
                    environmentPointer,
                    launch.Cwd,
                    ref startup,
                    out var created))
                {
                    throw new LaunchAdmissionException("provider_create_failed");
                }
                process = SafeProcessHandle.FromRaw(created.hProcess);
                thread = SafeThreadHandle.FromRaw(created.hThread);
            }
            finally
            {
                Marshal.FreeHGlobal(environmentPointer);
                // The child inherited these exact ends during CreateProcessW;
                // parent ownership ends before assignment/resume can fail.
                pipes.DisposeChildEnds();
            }

            if (Environment.GetEnvironmentVariable("KIDITEM_JOB_RUNNER_TEST_FORCE_ASSIGN_FAILURE") == "1" ||
                !AssignProcessToJobObject(job, process!))
            {
                throw new LaunchAdmissionException("provider_job_assignment_failed");
            }
            if (ResumeThread(thread!) == uint.MaxValue)
            {
                throw new LaunchAdmissionException("provider_resume_failed");
            }
            thread.Dispose();
            thread = null;
            var running = new NativeProviderProcess(process!, pipes.DetachParentStreams());
            process = null;
            return running;
        }
        catch (Exception error)
        {
            if (process is not null)
            {
                TerminateAndWait(process);
                process.Dispose();
            }
            if (error is LaunchAdmissionException) throw;
            throw new LaunchAdmissionException("provider_launch_failed");
        }
        finally
        {
            thread?.Dispose();
        }
    }

    private static void ValidateLaunch(Launch? launch)
    {
        if (launch is null ||
            string.IsNullOrWhiteSpace(launch.Executable) ||
            string.IsNullOrWhiteSpace(launch.Cwd) ||
            launch.Args is null ||
            launch.Env is null ||
            !Path.IsPathFullyQualified(launch.Executable) ||
            !Path.IsPathFullyQualified(launch.Cwd) ||
            ContainsNul(launch.Executable) ||
            ContainsNul(launch.Cwd))
        {
            throw new LaunchAdmissionException("launch_invalid");
        }
        if (launch.Args.Any(value => value is null || ContainsNul(value)) ||
            launch.Env.Any(pair => string.IsNullOrWhiteSpace(pair.Key) || pair.Key.Contains('=') || ContainsNul(pair.Key) || pair.Value is null || ContainsNul(pair.Value)))
        {
            throw new LaunchAdmissionException("launch_invalid");
        }
    }

    private static bool ContainsNul(string value) => value.IndexOf('\0') >= 0;

    private static string BuildEnvironmentBlock(IReadOnlyDictionary<string, string> environment)
    {
        var values = environment.OrderBy(pair => pair.Key, StringComparer.OrdinalIgnoreCase)
            .Select(pair => $"{pair.Key}={pair.Value}");
        return string.Join('\0', values) + "\0\0";
    }

    private static string BuildCommandLine(string executable, IReadOnlyList<string> args)
    {
        return string.Join(" ", new[] { QuoteWindowsArgument(executable) }.Concat(args.Select(QuoteWindowsArgument)));
    }

    private static string QuoteWindowsArgument(string value)
    {
        if (value.Length != 0 && value.All(character => character != ' ' && character != '\t' && character != '"')) return value;
        var result = new StringBuilder("\"");
        var slashes = 0;
        foreach (var character in value)
        {
            if (character == '\\')
            {
                slashes += 1;
                continue;
            }
            if (character == '"')
            {
                result.Append('\\', (slashes * 2) + 1);
                result.Append('"');
                slashes = 0;
                continue;
            }
            result.Append('\\', slashes);
            result.Append(character);
            slashes = 0;
        }
        result.Append('\\', slashes * 2);
        result.Append('"');
        return result.ToString();
    }

    private static void TerminateAndWait(SafeProcessHandle process)
    {
        if (!process.IsInvalid)
        {
            _ = TerminateProcess(process, 70);
            _ = WaitForSingleObject(process, 15_000);
        }
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
            if (count == 0) return bytes.Count == 0 ? null : Encoding.UTF8.GetString(bytes.ToArray());
            if (one[0] == (byte)'\n') return Encoding.UTF8.GetString(bytes.ToArray()).TrimEnd('\r');
            if (bytes.Count >= 64 * 1024) return null;
            bytes.Add(one[0]);
        }
    }

    private static SafeJobHandle CreateKillOnCloseJob()
    {
        var job = CreateJobObject(IntPtr.Zero, null);
        if (job.IsInvalid) throw new LaunchAdmissionException("job_create_failed");
        var info = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        var size = Marshal.SizeOf<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>();
        var pointer = Marshal.AllocHGlobal(size);
        try
        {
            Marshal.StructureToPtr(info, pointer, false);
            if (!SetInformationJobObject(job, 9, pointer, (uint)size)) throw new LaunchAdmissionException("job_limit_failed");
            return job;
        }
        catch { job.Dispose(); throw; }
        finally { Marshal.FreeHGlobal(pointer); }
    }

    private sealed class NativeProviderProcess : IDisposable
    {
        private readonly SafeProcessHandle _process;
        private readonly ParentProviderStreams _streams;
        private bool _disposed;
        public Stream StandardInput => _streams.StandardInput;
        public Stream StandardOutput => _streams.StandardOutput;
        public Stream StandardError => _streams.StandardError;
        public int ExitCode
        {
            get
            {
                if (!GetExitCodeProcess(_process, out var code) || code == STILL_ACTIVE) throw new LaunchAdmissionException("provider_exit_unknown");
                return unchecked((int)code);
            }
        }

        public NativeProviderProcess(SafeProcessHandle process, ParentProviderStreams streams)
        {
            _process = process;
            _streams = streams;
        }

        public Task WaitForExitAsync() => Task.Run(() =>
        {
            if (WaitForSingleObject(_process, INFINITE) != WAIT_OBJECT_0) throw new LaunchAdmissionException("provider_wait_failed");
        });

        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;
            _streams.Dispose();
            _process.Dispose();
        }
    }

    private sealed class ParentProviderStreams : IDisposable
    {
        public FileStream StandardInput { get; }
        public FileStream StandardOutput { get; }
        public FileStream StandardError { get; }
        public ParentProviderStreams(FileStream standardInput, FileStream standardOutput, FileStream standardError)
        {
            StandardInput = standardInput;
            StandardOutput = standardOutput;
            StandardError = standardError;
        }
        public void Dispose()
        {
            StandardInput.Dispose();
            StandardOutput.Dispose();
            StandardError.Dispose();
        }
    }

    private sealed class ProviderPipes : IDisposable
    {
        public SafeFileHandle ChildStandardInput { get; private set; }
        public SafeFileHandle ChildStandardOutput { get; private set; }
        public SafeFileHandle ChildStandardError { get; private set; }
        private readonly FileStream _parentStandardInput;
        private readonly FileStream _parentStandardOutput;
        private readonly FileStream _parentStandardError;
        private bool _childEndsDisposed;
        private bool _parentStreamsDetached;

        private ProviderPipes(
            SafeFileHandle childStandardInput,
            SafeFileHandle childStandardOutput,
            SafeFileHandle childStandardError,
            FileStream parentStandardInput,
            FileStream parentStandardOutput,
            FileStream parentStandardError)
        {
            ChildStandardInput = childStandardInput;
            ChildStandardOutput = childStandardOutput;
            ChildStandardError = childStandardError;
            _parentStandardInput = parentStandardInput;
            _parentStandardOutput = parentStandardOutput;
            _parentStandardError = parentStandardError;
        }

        public static ProviderPipes Create()
        {
            var attributes = new SECURITY_ATTRIBUTES { nLength = Marshal.SizeOf<SECURITY_ATTRIBUTES>(), bInheritHandle = true };
            SafeFileHandle? childIn = null;
            SafeFileHandle? parentIn = null;
            SafeFileHandle? childOut = null;
            SafeFileHandle? parentOut = null;
            SafeFileHandle? childErr = null;
            SafeFileHandle? parentErr = null;
            try
            {
                if (!CreatePipe(out childIn, out parentIn, ref attributes, 0) || !SetHandleInformation(parentIn, HANDLE_FLAG_INHERIT, 0)) throw new LaunchAdmissionException("provider_pipe_failed");
                if (!CreatePipe(out parentOut, out childOut, ref attributes, 0) || !SetHandleInformation(parentOut, HANDLE_FLAG_INHERIT, 0)) throw new LaunchAdmissionException("provider_pipe_failed");
                if (!CreatePipe(out parentErr, out childErr, ref attributes, 0) || !SetHandleInformation(parentErr, HANDLE_FLAG_INHERIT, 0)) throw new LaunchAdmissionException("provider_pipe_failed");
                return new ProviderPipes(
                    childIn,
                    childOut,
                    childErr,
                    new FileStream(parentIn, FileAccess.Write, 4096, false),
                    new FileStream(parentOut, FileAccess.Read, 4096, false),
                    new FileStream(parentErr, FileAccess.Read, 4096, false));
            }
            catch
            {
                childIn?.Dispose();
                parentIn?.Dispose();
                childOut?.Dispose();
                parentOut?.Dispose();
                childErr?.Dispose();
                parentErr?.Dispose();
                throw;
            }
        }

        public void DisposeChildEnds()
        {
            if (_childEndsDisposed) return;
            _childEndsDisposed = true;
            ChildStandardInput.Dispose();
            ChildStandardOutput.Dispose();
            ChildStandardError.Dispose();
        }

        public ParentProviderStreams DetachParentStreams()
        {
            _parentStreamsDetached = true;
            return new ParentProviderStreams(_parentStandardInput, _parentStandardOutput, _parentStandardError);
        }

        public void Dispose()
        {
            DisposeChildEnds();
            if (!_parentStreamsDetached)
            {
                _parentStandardInput.Dispose();
                _parentStandardOutput.Dispose();
                _parentStandardError.Dispose();
            }
        }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct SECURITY_ATTRIBUTES
    {
        public int nLength;
        public IntPtr lpSecurityDescriptor;
        [MarshalAs(UnmanagedType.Bool)] public bool bInheritHandle;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct STARTUPINFO
    {
        public int cb;
        public string? lpReserved;
        public string? lpDesktop;
        public string? lpTitle;
        public int dwX;
        public int dwY;
        public int dwXSize;
        public int dwYSize;
        public int dwXCountChars;
        public int dwYCountChars;
        public int dwFillAttribute;
        public uint dwFlags;
        public short wShowWindow;
        public short cbReserved2;
        public IntPtr lpReserved2;
        public IntPtr hStdInput;
        public IntPtr hStdOutput;
        public IntPtr hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct PROCESS_INFORMATION
    {
        public IntPtr hProcess;
        public IntPtr hThread;
        public int dwProcessId;
        public int dwThreadId;
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

    private abstract class SafeKernelHandle : SafeHandle
    {
        protected SafeKernelHandle() : base(IntPtr.Zero, true) { }
        public override bool IsInvalid => handle == IntPtr.Zero || handle == new IntPtr(-1);
        protected void Initialize(IntPtr value) => SetHandle(value);
        protected override bool ReleaseHandle() => CloseHandle(handle);
    }

    private sealed class SafeProcessHandle : SafeKernelHandle
    {
        public static SafeProcessHandle FromRaw(IntPtr value)
        {
            var handle = new SafeProcessHandle();
            handle.Initialize(value);
            return handle;
        }
    }

    private sealed class SafeThreadHandle : SafeKernelHandle
    {
        public static SafeThreadHandle FromRaw(IntPtr value)
        {
            var handle = new SafeThreadHandle();
            handle.Initialize(value);
            return handle;
        }
    }

    private sealed class SafeJobHandle : SafeKernelHandle
    {
        public SafeJobHandle() { }
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CreateProcessW(
        string? applicationName,
        StringBuilder commandLine,
        IntPtr processAttributes,
        IntPtr threadAttributes,
        [MarshalAs(UnmanagedType.Bool)] bool inheritHandles,
        uint creationFlags,
        IntPtr environment,
        string? currentDirectory,
        ref STARTUPINFO startupInfo,
        out PROCESS_INFORMATION processInformation);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CreatePipe(out SafeFileHandle readPipe, out SafeFileHandle writePipe, ref SECURITY_ATTRIBUTES attributes, int size);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetHandleInformation(SafeHandle handle, uint mask, uint flags);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeJobHandle CreateJobObject(IntPtr attributes, string? name);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetInformationJobObject(SafeJobHandle job, int infoClass, IntPtr info, uint length);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool AssignProcessToJobObject(SafeJobHandle job, SafeProcessHandle process);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint ResumeThread(SafeThreadHandle thread);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool TerminateProcess(SafeProcessHandle process, uint exitCode);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(SafeProcessHandle handle, uint milliseconds);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetExitCodeProcess(SafeProcessHandle process, out uint exitCode);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CloseHandle(IntPtr handle);
}
