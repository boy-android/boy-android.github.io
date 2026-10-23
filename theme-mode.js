(function () {
  try {
    if (localStorage.getItem("boyAndroidTheme") === "light") {
      document.documentElement.classList.add("light-theme");
    }
  } catch (error) {
    // Keep the default dark theme when browser storage is unavailable.
  }
})();
