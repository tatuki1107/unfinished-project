import { createCloudHandler } from '../cloud-server.mjs';
import { createNeonHandler } from '../neon-server.mjs';
let handler;
export default (req,res) => {
  handler ??= process.env.DATABASE_URL ? createNeonHandler({secure:true}) : createCloudHandler({secure:true});
  return handler(req,res);
};
