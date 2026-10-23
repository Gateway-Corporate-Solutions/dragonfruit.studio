// Runs before page paint; contains no user-supplied data.
export const themeBootstrap =
  "try{var t=localStorage.getItem('dragonfruit-theme');document.documentElement.dataset.theme=t==='dark'||t==='light'?t:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}catch(e){document.documentElement.dataset.theme='light'}";
