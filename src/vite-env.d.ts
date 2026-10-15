/** 이미지 import(빌드 때 data URI로 인라인되어 단일 파일 미리보기에서도 열린다) */
declare module '*.png' {
  const src: string;
  export default src;
}
