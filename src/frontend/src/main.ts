import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { setBasePath } from './composables/useApi'
import { basePath } from './router'
import { installErrorHandlers } from './lib/errorReporter'

// Set the basePath for API calls
setBasePath(basePath)

const app = createApp(App)
installErrorHandlers(app)
app.use(router)
app.mount('#app')
