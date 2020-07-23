import { API } from 'homebridge';
import MotionMountDynamicPlatform, {
  PLATFORM_NAME,
} from './platform/MotionMountDynamicPlatform';

/*
 * Initializer function called when the plugin is loaded.
 */
export = (api: API): void => {
  api.registerPlatform(PLATFORM_NAME, MotionMountDynamicPlatform);
};
