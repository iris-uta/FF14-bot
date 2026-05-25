import { auth, signIn, signOut, isAuthConfigured } from "@/auth";

export async function AuthNav() {
  if (!isAuthConfigured()) {
    return (
      <span className="text-xs text-black/50 dark:text-white/50" title="AUTH_DISCORD_ID / AUTH_DISCORD_SECRET / AUTH_SECRET 未設定">
        ログイン (未設定)
      </span>
    );
  }

  const session = await auth();

  if (session?.user) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm">
          {session.user.name ?? "ユーザー"}
        </span>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button type="submit" className="text-sm underline hover:opacity-80">
            ログアウト
          </button>
        </form>
      </div>
    );
  }

  return (
    <form
      action={async () => {
        "use server";
        await signIn("discord", { redirectTo: "/dashboard" });
      }}
    >
      <button
        type="submit"
        className="inline-flex items-center gap-2 rounded-md bg-[#5865F2] hover:bg-[#4752C4] text-white px-4 py-1.5 text-sm font-medium transition-colors"
      >
        Discord でログイン
      </button>
    </form>
  );
}
