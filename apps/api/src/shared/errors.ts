export class DomainError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = this.constructor.name
    this.status = status
  }
}

export class NotFoundError extends DomainError {
  constructor(message = "Not found") {
    super(message, 404)
  }
}

export class BadRequestError extends DomainError {
  constructor(message = "Bad request") {
    super(message, 400)
  }
}
