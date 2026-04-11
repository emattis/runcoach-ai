import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Sidebar } from "./sidebar";

export const metadata: Metadata = {
  title: "RunCoach AI",
  description: "Personalized AI-powered road running coach",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

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
      <body className="min-h-full flex flex-col md:flex-row">
        <Sidebar />
        <main className="flex-1 min-h-screen p-4 pb-[calc(var(--bottom-nav-height)+16px)] md:ml-[var(--sidebar-width)] md:p-8 md:pb-8">
          {children}
        </main>
      </body>
    </html>
  );
}
