/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./views/**/*.ejs", "./public/**/*.js"],
  theme: {
    extend: {
      colors: {
        pickle: {
          // 取自你提供的 PickleVibes logo 視覺色調（桃紅 / 湖水綠 / 黃）
          pink: "#E6027E",
          teal: "#09B7BC",
          yellow: "#F7C300",
          ink: "#0B1220",
          mist: "#F6F8FC"
        }
      }
    }
  },
  plugins: []
};

