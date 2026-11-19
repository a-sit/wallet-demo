// Farbschema vor dem ersten Zeichnen setzen, damit die Seite nicht kurz im falschen Schema aufblitzt.
// Gespeicherte Wahl hat Vorrang, sonst gilt die Einstellung des Betriebssystems. Siehe web/src/theme.ts.
;(function () {
  var theme
  try {
    theme = localStorage.getItem('theme')
  } catch (e) {
    /* kein Speicher */
  }
  if (theme !== 'light' && theme !== 'dark') theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
})()
