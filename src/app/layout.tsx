import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "./sidebar";

export const metadata: Metadata = {
  title: "RunCoach AI",
  description: "Personalized AI-powered road running coach",
};

// Inline script to apply theme before first paint (prevents flash)
const themeScript = `
(function(){
  var t = localStorage.getItem('runcoach-theme');
  if (t === 'dark') document.documentElement.setAttribute('data-theme','dark');
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex">
        <Sidebar />
        <main className="ml-[220px] flex-1 min-h-screen p-8">{children}</main>
      </body>
    </html>
  );
}
