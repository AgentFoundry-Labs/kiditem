using System.Diagnostics;

// Test-only child used by Windows CI to prove the production helper owns an
// entire process tree. It contains no Runner production control behavior.
internal static class Program
{
    public static async Task<int> Main(string[] args)
    {
        if (args.Length == 2 && args[0] == "--tree")
        {
            var executable = Environment.ProcessPath ?? throw new InvalidOperationException("fixture_path_missing");
            using var child = Process.Start(new ProcessStartInfo
            {
                FileName = executable,
                UseShellExecute = false,
                CreateNoWindow = true,
                ArgumentList = { "--child" },
            }) ?? throw new InvalidOperationException("fixture_child_start_failed");
            await File.WriteAllTextAsync(args[1], $"{Environment.ProcessId}\n{child.Id}\n");
            await Task.Delay(Timeout.InfiniteTimeSpan);
            return 0;
        }
        if (args.Length == 1 && args[0] == "--child")
        {
            await Task.Delay(Timeout.InfiniteTimeSpan);
            return 0;
        }
        if (args.Length == 2 && args[0] == "--marker")
        {
            await File.WriteAllTextAsync(args[1], "resumed");
            return 0;
        }
        return 64;
    }
}
