import { Router, type IRouter } from "express";
import authRouter from "./auth";
import healthRouter from "./health";
import notificationsRouter from "./notifications";
import engagementRouter from "./engagement";
import turiwaRouter from "./turiwa";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use(notificationsRouter);
router.use(engagementRouter);
router.use(turiwaRouter);

export default router;
