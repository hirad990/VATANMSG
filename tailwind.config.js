/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        vatan: {
          ink: "#080D1A",
          panel: "#10182A",
          violet: "#7167F8",
          cyan: "#19B8D4",
          mint: "#23C99A",
        },
      },
      borderRadius: {
        "ios-card": "28px",
      },
      boxShadow: {
        glass: "0 18px 50px rgba(0,0,0,0.18)",
      },
    },
  },
  plugins: [],
};
