import type { Config } from "tailwindcss"

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        board: {
          bg: "#0b1020",
          panel: "#131a2e",
          panel2: "#1a2338",
          line: "#26314c",
          text: "#e6ebf5",
          muted: "#8b98b4",
          accent: "#5b8cff",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,.35), 0 8px 24px -12px rgba(0,0,0,.6)",
        pop: "0 20px 60px -20px rgba(0,0,0,.75)",
      },
    },
  },
  plugins: [],
}

export default config
