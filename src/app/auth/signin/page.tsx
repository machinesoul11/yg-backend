import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import SignInForm from "./SignInForm";

export const metadata = {
  title: "Staff Sign In | YesGoddess",
  description: "Internal staff authentication",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await getServerSession(authOptions);
  const params = await searchParams;

  // If already authenticated, redirect to callback or dashboard
  if (session) {
    redirect(params.callbackUrl || "/admin/dashboard");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8">
        <div>
          <h2 className="text-center text-3xl font-bold text-gray-900">
            YesGoddess Staff Portal
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Internal use only
          </p>
        </div>

        <SignInForm
          callbackUrl={params.callbackUrl}
          error={params.error}
        />
      </div>
    </div>
  );
}
