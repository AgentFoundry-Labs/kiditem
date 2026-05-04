export function LoginBackground() {
  return (
    <>
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-gradient-to-br from-blue-400 to-cyan-400 opacity-40 dark:opacity-15 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 top-1/3 h-[28rem] w-[28rem] rounded-full bg-gradient-to-br from-purple-400 to-pink-400 opacity-40 dark:opacity-15 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-gradient-to-br from-indigo-400 to-blue-400 opacity-30 dark:opacity-10 blur-3xl" />
    </>
  );
}
