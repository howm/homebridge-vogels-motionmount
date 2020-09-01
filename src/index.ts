import { API } from 'homebridge';
import MotionMountDynamicPlatform, {
  PLUGIN_NAME,
  PLATFORM_NAME,
} from './platform/MotionMountDynamicPlatform';

/*
 * Initializer function called when the plugin is loaded.
 */
export = (api: API): void => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, MotionMountDynamicPlatform);
};
