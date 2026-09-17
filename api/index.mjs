import { createCloudHandler } from '../cloud-server.mjs';
let handler;
export default (req,res) => {
  handler ??= createCloudHandler({secure:true});
  return handler(req,res);
};
