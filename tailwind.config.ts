import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)"],
        cjkDisplay: ["var(--font-cjk-display)"],
        body: ["var(--font-body)"]
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))"
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))"
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))"
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))"
        }
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)"
      },
      keyframes: {
        "fade-rise": {
          from: { opacity: "0", transform: "translateY(24px)" },
          to: { opacity: "1", transform: "translateY(0)" }
        },
        "forest-drift": {
          "0%, 100%": { transform: "scale(1.04) translate3d(0, 0, 0)" },
          "50%": { transform: "scale(1.08) translate3d(-1.4%, -1%, 0)" }
        },
        "leaf-float": {
          "0%": { transform: "translate3d(0, -12vh, 0) rotate(0deg)", opacity: "0" },
          "8%": { opacity: "0.7" },
          "100%": { transform: "translate3d(var(--leaf-x), 112vh, 0) rotate(360deg)", opacity: "0" }
        }
      },
      animation: {
        "fade-rise": "fade-rise 0.8s ease-out both",
        "fade-rise-delay": "fade-rise 0.8s ease-out 0.2s both",
        "fade-rise-delay-2": "fade-rise 0.8s ease-out 0.4s both",
        "forest-drift": "forest-drift 18s ease-in-out infinite",
        "leaf-float": "leaf-float var(--leaf-duration) linear infinite"
      }
    }
  },
  plugins: [animate]
} satisfies Config;

export default config;
