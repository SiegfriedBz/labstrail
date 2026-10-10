import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Joins class names, a later Tailwind class winning over an earlier one it conflicts with:
 * shadcn's helper, which its components (`components/ui`) take their `className` through.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
