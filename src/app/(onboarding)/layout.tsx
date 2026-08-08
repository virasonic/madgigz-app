export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="pt-safe-page mx-auto flex min-h-screen w-full max-w-md flex-1 flex-col bg-background px-6 pb-10">
      {children}
    </div>
  );
}
