import { toast as rt, type ToastOptions } from 'react-toastify';

const base: ToastOptions = {
  position: 'top-right',
  autoClose: 3500,
  hideProgressBar: false,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: true,
};

/** App-wide toast API (react-toastify). Prefer this instead of `window.alert`. */
export const toast = {
  success: (message: string, opts?: ToastOptions) => rt.success(message, { ...base, ...opts }),
  error: (message: string, opts?: ToastOptions) => rt.error(message, { ...base, ...opts }),
  warning: (message: string, opts?: ToastOptions) => rt.warning(message, { ...base, ...opts }),
  info: (message: string, opts?: ToastOptions) => rt.info(message, { ...base, ...opts }),
};

export { ToastContainer } from 'react-toastify';
