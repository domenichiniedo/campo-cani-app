// Demo: al primo avvio entra come proprietario, così si vede subito il piano del giorno.
(function () {
  try {
    if (!localStorage.getItem('campo-demo-avviata')) {
      var s = window.__demoSession && window.__demoSession('proprietario@demo.it');
      if (s) localStorage.setItem('sb-demo-auth-token', JSON.stringify(s));
      localStorage.setItem('campo-demo-avviata', '1');
    }
  } catch (e) {}
})();
