/** Uniform four-digit share PINs, excluding repeated digits and straight runs. */
export const newSharePin = () => {
  const value = new Uint16Array(1);
  let pin: string;
  // Reject values outside the PIN range so each accepted number is equally likely.
  do { crypto.getRandomValues(value); pin = String(value[0]).padStart(4, '0'); }
  while (value[0] >= 10000 || /^(\d)\1{3}$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin));
  return pin;
};
