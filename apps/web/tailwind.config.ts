/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        stellar: {
          50: "#f0f7ff",
          100: "#e0effe",
          500: "#0066cc",
          600: "#0052a3",
          700: "#003d7a",
        },
      },
    },
  },
  plugins: [],
};
