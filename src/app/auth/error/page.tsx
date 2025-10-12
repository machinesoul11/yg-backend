import Link from "next/link";

interface ErrorPageProps {
  searchParams: Promise<{
    error?: string;
  }>;
}

export default async function AuthErrorPage({ searchParams }: ErrorPageProps) {
  const params = await searchParams;
  const error = params.error;

  const errorMessages: Record<string, { title: string; description: string }> = {
    AccessDenied: {
      title: "Access Denied",
      description: "You do not have permission to access this resource. Only authorized YesGoddess staff members can access the admin portal.",
    },
    Configuration: {
      title: "Configuration Error",
      description: "There is a problem with the server configuration. Please contact IT support.",
    },
    Verification: {
      title: "Verification Required",
      description: "Please verify your email address before accessing this resource.",
    },
    Default: {
      title: "Authentication Error",
      description: "An error occurred during authentication. Please try again.",
    },
  };

  const errorInfo = errorMessages[error || "Default"] || errorMessages.Default;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 text-red-600 mb-4">
            <svg
              className="w-full h-full"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            {errorInfo.title}
          </h2>
          <p className="text-gray-600 mb-6">{errorInfo.description}</p>
          
          {error === "AccessDenied" && (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-4 mb-6">
              <p className="text-sm text-amber-800">
                <strong>Note:</strong> Only staff members with @yesgoddess.agency email addresses can access the admin portal.
              </p>
            </div>
          )}

          <div className="space-y-3">
            <Link
              href="/auth/signin"
              className="block w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Back to Sign In
            </Link>
            <Link
              href="/"
              className="block w-full py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Go to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
