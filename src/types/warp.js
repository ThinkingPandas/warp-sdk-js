// @flow
/**
 * References
 */
export type WarpOptionsType = {
    apiKey: string,
    masterKey?: string,
    serverURL?: string,
    api?: Object,
    sessionToken?: string,
    currentUser?: Object,
    platform?: string,
    timeout?: number,
    maxRequests?: number,
    supportLegacy?: boolean
}