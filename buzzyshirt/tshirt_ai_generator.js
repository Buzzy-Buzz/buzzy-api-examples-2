import axios from "axios";
import _ from "lodash";
import Bottleneck from "bottleneck";
import {
  insertMicroAppRow,
  getMicroAppData,
  updateMicroAppDataRow,
  errorResponse,
} from "buzzy-api-nodejs";

const BUZZY_DEBUG = process.env.BUZZY_DEBUG;
const BUZZY_API_CHECK = process.env.BUZZY_API_CHECK;
const BUZZY_API_USERID = process.env.BUZZY_API_USERID;
const BUZZY_API_TOKEN = process.env.BUZZY_API_TOKEN;
const BUZZY_IMAGES_APP_ID = process.env.BUZZY_IMAGES_APP_ID;
const BUZZY_PROMPT_APP_ID = process.env.BUZZY_PROMPT_APP_ID;
const LEONARDOAI_API_KEY = process.env.LEONARDOAI_API_KEY;
const BUZZY_URL = process.env.BUZZY_URL;

async function generateImage({ prompt }) {
  const apiKey = LEONARDOAI_API_KEY; // Replace with your API key
  const url = "https://cloud.leonardo.ai/api/rest/v1/generations"; // Replace with the correct API URL

  try {
    const response = await axios.post(
      url,
      {
        height: 512,
        prompt,
        width: 512,
        alchemy: true,
        photoReal: true,
        photoRealStrength: 0.5,
        presetStyle: "CINEMATIC",
        public: false,
        nsfw: false,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    return { status: "success", data: response.data }; // Return the response data
  } catch (error) {
    // Handle errors
    console.error(error);

    return errorResponse(error);
    // return null;
  }
}

async function getImages(generationId) {
  const apiKey = LEONARDOAI_API_KEY; // Replace with your API key
  const url = `https://cloud.leonardo.ai/api/rest/v1/generations/${generationId}`; // Replace with the correct API URL

  try {
    const response = await axios.get(
      url,

      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    // Handle the response
    console.log("LEONARDO getAndUpdateImages RESPONSE:", response.data);
    const { generations_by_pk } = response.data || {}; // Return the response data
    const generated_images = generations_by_pk?.generated_images || [];
    return generated_images;
  } catch (error) {
    // Handle errors
    console.error(error);
    return null;
  }
}

export const handler = async (event) => {
  // Make a request for a user with a given ID

  try {
    const { body } = event;

    if (!body) {
      return errorResponse("invalid params");
    }

    const {
      debug = true,
      url = BUZZY_URL,
      process = "genimage", // or getimages
      prompt = "A tropical beach",
      promptRowID,
      buzzyAdminToken,
      type,
      data,
      buzzyImagesAppID = BUZZY_IMAGES_APP_ID,
    } = typeof body === "object" ? body : JSON.parse(body);

    switch (type) {
      case "image_generation.completed":
      case "image_generation.complete":
        {
          const { object } = data || {};
          const { images, id: generationId } = object || {};

          if (Array.isArray(images) && images.length > 0) {
            const promptRows = await getMicroAppData({
              microAppID: BUZZY_PROMPT_APP_ID,
              authToken: BUZZY_API_TOKEN,
              userId: BUZZY_API_USERID,
              url: BUZZY_URL,
              optViewFilters: [
                {
                  sortVal2: generationId,
                },
              ],
            });

            const promptRow = promptRows?.length > 0 ? promptRows[0] : null;
            if (!promptRow) {
              console.log("no promptRow");
              return errorResponse("no promptRow");
            }

            // BUZZY_DEBUG && console.log("promptRow FOUND", promptRow);
            const {
              userID,
              generationId: promptGenerationId,
              _id: foundPromptRowID,
            } = promptRow || {};

            for (let i = 0; i < images.length; i++) {
              const image = images[i];
              const { url: ImageUrl, nsfw } = image;

              const imageAppRow = await insertMicroAppRow({
                microAppID: BUZZY_IMAGES_APP_ID,
                authToken: BUZZY_API_TOKEN,
                userId: BUZZY_API_USERID,
                url: BUZZY_URL,
                embeddingRowID: foundPromptRowID,
                rowData: {
                  ImageUrl,
                  nsfw,
                },
                userID,
              });
            }
          } else {
            debug && console.log("no images", images);
            return errorResponse("no images");
          }
        }
        break;
      case "create_ai_images": {
        debug &&
          console.log(
            "body recieved",
            typeof body === "object" ? body : JSON.parse(body)
          );

        if (!buzzyAdminToken || buzzyAdminToken !== BUZZY_API_CHECK) {
          console.log("invalid API request");
          return errorResponse("invalid buzzyAdminToken", buzzyAdminToken);
        }

        const {
          status,
          body: errBody,
          data: genImageResponse,
        } = await generateImage({ prompt });
        debug &&
          console.log(`generateImage ${[prompt]} response`, {
            genImageResponse,
            status,
          });
        const { sdGenerationJob } = genImageResponse || {};

        if (status === "error") {
          const { response: errResponse } = errBody || {};
          const { data: dataErr } = errResponse || {};
          const { error: displayError } = dataErr || {};

          if (!displayError) {
            console.log("error generating images [0]", dataErr);
            return errorResponse("error generating images [0]");
          }

          const updatedRow = await updateMicroAppDataRow({
            rowID: promptRowID,
            authToken: BUZZY_API_TOKEN,
            userId: BUZZY_API_USERID,
            url: BUZZY_URL,
            rowData: {
              imageGenerationError: displayError,
            },
          });
          return errorResponse(`Error Generatinge images [1]: ${displayError}`);
        }

        const { generationId } = sdGenerationJob || {};
        if (!generationId) {
          console.log("no generationId", sdGenerationJob);
          return errorResponse("no generationId");
        }
        const updateResponse = await updateMicroAppDataRow({
          rowID: promptRowID,
          authToken: BUZZY_API_TOKEN,
          userId: BUZZY_API_USERID,
          url: BUZZY_URL,
          rowData: {
            generationId,
          },
        });

        return {
          status: "success",
          message: "tshirt [100]",
        };
      }
      default:
        break;
    }
  } catch (error) {
    debug && console.log("Lambda error[0]", error);
    return errorResponse(error);
  }
};
