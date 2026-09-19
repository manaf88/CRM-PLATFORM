/**
 * Error codes returned in the body of the approval endpoints' 4xx responses.
 *
 * The rest of the API answers with Nest's default `{ statusCode, message }`,
 * which the frontend can only match on by string. The approval flow has
 * branches the UI must react to differently ("pick an approver" vs "somebody
 * beat you to it"), so those carry a stable code alongside the message.
 */
export enum TaskApprovalErrorCode {
  APPROVER_REQUIRED = 'APPROVER_REQUIRED',
  INVALID_TRANSITION = 'INVALID_TRANSITION',
  REVIEW_ACTIONS_ONLY = 'REVIEW_ACTIONS_ONLY',
  REVIEW_NOTE_REQUIRED = 'REVIEW_NOTE_REQUIRED',
}
