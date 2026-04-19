const mockGoogleSignin = {
  configure: jest.fn(),
  hasPlayServices: jest.fn().mockResolvedValue(true),
  signIn: jest.fn().mockResolvedValue({ user: { email: "test@gmail.com" }, serverAuthCode: "mock-code" }),
  signInSilently: jest.fn().mockResolvedValue({ user: { email: "test@gmail.com" } }),
  signOut: jest.fn().mockResolvedValue(null),
  getCurrentUser: jest.fn().mockReturnValue(null),
  getTokens: jest.fn().mockResolvedValue({ accessToken: "mock-token", idToken: "mock-id" }),
};

module.exports = { GoogleSignin: mockGoogleSignin };
