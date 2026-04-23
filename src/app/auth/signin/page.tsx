import { signIn } from "@/platform/auth/config";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-8">Polaris</h1>
        <p className="text-gray-500 mb-8">Personal Operating System</p>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="rounded-lg bg-black px-6 py-3 text-white hover:bg-gray-800"
          >
            Sign in with Google
          </button>
        </form>
      </div>
    </div>
  );
}
