import { registerRootComponent } from 'expo';
import './src/tracking';
import { configureMessaging } from './src/api';
import App from './App';
configureMessaging();
registerRootComponent(App);
