import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        scaffold: {
          50: "#f0f4ff",
          100: "#dce7ff",
          500: "#4f6ef7",
          600: "#3b55e6",
          700: "#2d43c9",
          900: "#1a2780",
        },
      },
    },
  },
  plugins: [],
};

export default config;
