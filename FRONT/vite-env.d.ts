/// <reference types="vite/client" />

declare module "*.png?inline" {
  const src: string;
  export default src;
}

declare module "*.jpg?inline" {
  const src: string;
  export default src;
}

declare module "*.webp?inline" {
  const src: string;
  export default src;
}
