// paymentService stub — studio users always have full access
const paymentService = {
  getAccess: async () => ({ success: true, hasAccess: true }),
  checkMembership: async () => ({ active: true }),
};
export default paymentService;
