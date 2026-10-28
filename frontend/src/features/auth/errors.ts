export class RoleRejectedError extends Error {
  constructor() {
    super('Role not allowed');
    this.name = 'RoleRejectedError';
  }
}
