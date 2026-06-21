import Link from "next/link";
import { ScaffoldLogo } from "./ScaffoldLogo";

export function Header() {
  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center">
          <ScaffoldLogo variant="full" height={26} color="#1e293b" />
        </Link>
        <nav className="flex items-center gap-4 text-sm text-gray-600">
          <Link href="/" className="hover:text-gray-900 transition-colors">
            Dashboard
          </Link>
          <Link
            href="/connect"
            className="px-3 py-1.5 bg-scaffold-500 text-white rounded-lg hover:bg-scaffold-600 transition-colors"
          >
            Connect platform
          </Link>
        </nav>
      </div>
    </header>
  );
}
