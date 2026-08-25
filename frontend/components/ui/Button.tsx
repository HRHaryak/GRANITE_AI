"use client";
import React from "react";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children: React.ReactNode;
};

export default function Button({ children, className = "", ...rest }: Props) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center rounded-lg px-4 py-2 bg-gradient-to-r from-sky-600 to-teal-500 text-white font-semibold shadow-md hover:opacity-95 disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}
