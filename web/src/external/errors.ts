export class AddonNotFoundError extends Error {
  constructor() {
    super('未检测到浏览器扩展');
    this.name = new.target.name;
  }
}
