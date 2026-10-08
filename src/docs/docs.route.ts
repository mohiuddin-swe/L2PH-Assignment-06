import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { openApiSpec } from "./openapi";

const router = Router();

// Raw spec, handy for importing into Postman/Insomnia: GET /api/v1/docs/json
router.get("/json", (_req, res) => {
  res.json(openApiSpec);
});

router.use("/", swaggerUi.serve, swaggerUi.setup(openApiSpec, { customSiteTitle: "UMS API Docs", swaggerOptions: { persistAuthorization: true } }));

export const docsRoutes = router;