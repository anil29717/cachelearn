import React from 'react';

export function InternalFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-red-100 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="text-sm text-gray-600">
            © {year} Cache Learning — Internal Knowledge Hub
          </div>
          <div className="text-xs text-gray-500">
            Private content. Authorized employees only.
          </div>
        </div>
      </div>
    </footer>
  );
}

