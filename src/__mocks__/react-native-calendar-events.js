module.exports = {
  requestPermissions: jest.fn().mockResolvedValue("authorized"),
  checkPermissions: jest.fn().mockResolvedValue("authorized"),
  fetchAllEvents: jest.fn().mockResolvedValue([]),
  saveEvent: jest.fn().mockResolvedValue("event-id"),
  removeEvent: jest.fn().mockResolvedValue(true),
};
