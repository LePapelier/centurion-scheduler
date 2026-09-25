import { defineConfig } from 'vite'

// Publié sous https://paul-laurent.fr/centurion-scheduler/ : le build GitHub
// Pages sert tout depuis ce sous-répertoire, le serveur de dev reste à la racine.
export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/centurion-scheduler/' : '/',
})
