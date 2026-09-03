// Nav definition. Flat, deliberately.
//
// This used to be About / Experience / Portfolio▾(Achievements, Projects) / CV
// / Contact. Two problems with that: the whole site is a portfolio, so grouping
// two pages under "Portfolio" was a category that described everything and
// therefore distinguished nothing; and hiding two destinations behind a hover
// menu made them harder to reach than the four that weren't hidden, for no
// gain. Six flat items is well inside what a top nav carries comfortably, and
// removing the only dropdown removed a class of hover bugs with it.
//
// All urls are absolute — the submenu entries were once written relative
// ('p/achievements'), which react-router v6 resolves against the *current*
// route, so from /cv they pointed at /cv/p/achievements.

export const menuItems = [
  { title: 'About', url: '/about' },
  { title: 'Experience', url: '/experience' },
  { title: 'Projects', url: '/projects' },
  { title: 'Achievements', url: '/achievements' },
  { title: 'CV', url: '/cv' },
  { title: 'Contact', url: '/contact' },
];
