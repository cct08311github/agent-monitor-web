import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { setBasePath } from './composables/useApi'
import { basePath } from './router'

// Set the basePath for API calls
setBasePath(basePath)

const app = createApp(App)
app.use(router)
app.mount('#app')
