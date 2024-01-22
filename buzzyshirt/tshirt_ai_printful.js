import axios from "axios";
import _ from "lodash";
import Bottleneck from "bottleneck";

import {
  getMicroAppData,
  getMicroAppDataRow,
  updateMicroAppDataRow,
  errorResponse,
} from "buzzy-api-nodejs";

const BUZZY_DEBUG = process.env.BUZZY_DEBUG;
const BUZZY_API_CHECK = process.env.BUZZY_API_CHECK;
const BUZZY_API_USERID = process.env.BUZZY_API_USERID;
const BUZZY_API_TOKEN = process.env.BUZZY_API_TOKEN;
const BUZZY_IMAGES_APP_ID = process.env.BUZZY_IMAGES_APP_ID;
const PRINTFUL_API_TOKEN = process.env.PRINTFUL_API_TOKEN;
const BUZZY_URL = process.env.BUZZY_URL;
const PRINTFUL_API_URI = "https://api.printful.com";
const PRINTFUL_TSHIRT_PRODUCT_ID = 362;
const PRINTFUL_VARIANT_IDS = [10290, 10288, 10287, 10286, 10289];
const PRINTFUL_TSHIRT_POSITION_1 = {
  area_width: 1800,
  area_height: 2400,
  width: 1800,
  height: 1800,
  top: 300,
  left: 0,
};
const PRODUCT_VARIANT_IDS = {
  XS: 10290,
  S: 10286,
  M: 10287,
  L: 10288,
  XL: 10289,
  "2XL": 10290,
};

const DEPLOYMENT_LICENSE_TYPES = ["Medium", "Large"];

const BUZZY_WELCOME_LIST = "5f51b341-12c9-438e-8b16-f1997cf9e722";
const BUZZY_DEPLOYMENT_LIST = "03a99ed4-f560-4558-b4a8-16eb882bcdd0";
const SENDGRID_API_TOKEN = "AAAA";
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
const findAccessUser = async ({ email }) => {
  const optViewFilters = [
    {
      sortVal3: email,
    },
  ];
  BUZZY_DEBUG &&
    console.log("about to call getMicroApp data with", optViewFilters);

  //AG TBD try call with limiter
  const existingUser = await getMicroAppData({
    microAppID: BUZZY_ACCESS_APP_ID,
    authToken: BUZZY_API_TOKEN,
    userId: BUZZY_API_USERID,
    url: BUZZY_URL,
    optViewFilters,
  }); //needs to be sorted - ie get latest
  BUZZY_DEBUG && console.log("existingUser [1]", existingUser);
  return existingUser?.length > 0 ? existingUser[0] : null;
};

async function mockup({ imageURL }) {
  BUZZY_DEBUG && console.log("mockup imageURL", imageURL);
  const apiKey = PRINTFUL_API_TOKEN; // Replace with your API key
  const url = `${PRINTFUL_API_URI}/mockup-generator/create-task/${PRINTFUL_TSHIRT_PRODUCT_ID}`; // Replace with the correct API URL
  const options = {
    variant_ids: PRINTFUL_VARIANT_IDS,
    format: "jpg",
    files: [
      {
        placement: "front",
        image_url: imageURL,
        position: PRINTFUL_TSHIRT_POSITION_1,
      },
    ],
  };

  BUZZY_DEBUG && console.log("mockup options", options);

  try {
    const response = await axios.post(url, options, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    // Handle the response
    console.log("PRINTFUL RESPONSE:", response.data);
    return response.data; // Return the response data
  } catch (error) {
    // Handle errors
    console.error(error);
    return null;
  }
}

async function mockupGetTask({ taskKey }) {
  BUZZY_DEBUG && console.log("mockup mockupGetTask", taskKey);
  const apiKey = PRINTFUL_API_TOKEN; // Replace with your API key
  const url = `${PRINTFUL_API_URI}/mockup-generator/task?task_key=${taskKey}`; // Replace with the correct API URL

  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    // Handle the response
    console.log("PRINTFUL mockupGetTask RESPONSE:", response.data);
    return response.data; // Return the response data
  } catch (error) {
    // Handle errors
    console.error(error);
    return null;
  }
}

async function printfulOrder({ orderRowID }) {
  BUZZY_DEBUG && console.log("printfulOrder ", orderRowID);
  const apiKey = PRINTFUL_API_TOKEN; // Replace with your API key
  const url = `${PRINTFUL_API_URI}/orders`; // Replace with the correct API URL

  const orderRow = await getMicroAppDataRow(
    orderRowID,
    BUZZY_API_TOKEN,
    BUZZY_API_USERID,
    BUZZY_URL
  );
  BUZZY_DEBUG && console.log("orderRow", orderRow);
  if (!orderRow) {
    console.log("getquote no orderRow");
    return errorResponse("no orderRow");
  }

  const {
    name,
    embeddingRowID: designRowID,
    addressline1,
    addressline2,
    addressCity,
    addressPostcode,
    addressState,
    addressStateUS,
    addressCountry,
    "order lines": orderLinesAppID,
  } = orderRow || {};
  if (!designRowID) {
    console.log("getquote no designRowID");
    return errorResponse("no designRowID");
  }
  const designRow = await getMicroAppDataRow(
    designRowID,
    BUZZY_API_TOKEN,
    BUZZY_API_USERID,
    BUZZY_URL
  );
  BUZZY_DEBUG && console.log("designRow", designRow);
  if (!designRow) {
    console.log("getquote no designRow");
    return errorResponse("no designRow");
  }
  const { designUrl, mockupUrl } = designRow || {};
  if (!designUrl) {
    console.log("getquote no designUrl");
    return errorResponse("no designUrl");
  }

  try {
    const orderParams = {
      recipient: {
        name,
        address1: addressline1,

        city: addressCity,
        state_code: addressStateUS || addressState,
        country_code: addressCountry,
        zip: addressPostcode,
      },
      items: [],
    };

    BUZZY_DEBUG && console.log("orderLines [1]", orderLinesAppID);

    const orderLines = await getMicroAppData({
      microAppID: orderLinesAppID,

      authToken: BUZZY_API_TOKEN,
      userId: BUZZY_API_USERID,
      url: BUZZY_URL,
      optViewFilters: [{ embeddingRowID: orderRowID }],
    });

    BUZZY_DEBUG && console.log("orderLines [2]", orderLines);

    if (!orderLines || orderLines.length === 0) {
      console.log("getquote no orderLines");
      return errorResponse("no orderLines");
    }

    const items = orderLines.map((orderLine) => {
      const { quantity, size } = orderLine || {};
      return {
        variant_id: PRODUCT_VARIANT_IDS[size],
        quantity,
        files: [
          {
            url: designUrl,
          },
        ],
      };
    });
    BUZZY_DEBUG && console.log("items", items);
    orderParams.items = items;

    if (addressline2) {
      orderParams.recipient.address2 = addressline2;
    }
    const printfulOrderResponse = await axios.post(url, orderParams, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    // Handle the response
    console.log("PRINTFUL order quote RESPONSE:", printfulOrderResponse.data);
    const { result } = printfulOrderResponse.data || {};
    if (!result) {
      console.log("getquote no printfulOrderResponse");
      return errorResponse("no printfulOrderResponse");
    }
    const updatedRow = await updateMicroAppDataRow({
      rowID: orderRowID,
      authToken: BUZZY_API_TOKEN,
      userId: BUZZY_API_USERID,
      url: BUZZY_URL,
      rowData: {
        "Quote Details": result,
        orderDesignUrl: designUrl,
        mockupDesignUrl: mockupUrl,
        quoteReady: true,
      },
    });

    return printfulOrderResponse?.data; // Return the response data
  } catch (error) {
    // Handle errors
    console.error("PRINTFUL ERR[1]", error);
    const { response } = error || {};
    const { data } = response || {};
    const { result } = data || {};

    if (!result) {
      console.log("getquote no printfulOrderResponse");
      return errorResponse("no printfulOrderResponse");
    }

    const updatedRow = await updateMicroAppDataRow({
      rowID: orderRowID,
      authToken: BUZZY_API_TOKEN,
      userId: BUZZY_API_USERID,
      url: BUZZY_URL,
      rowData: {
        printfulError: result,

        quoteReady: true,
      },
    });
    return errorResponse(error);
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
      url = "https://tshirt.mybuzzy.app",
      process = "genimage", // or getimages
      prompt = "A tropical beach with perfect waves.",
      buzzyAdminToken,
      type,
      data,
      buzzyImagesAppID = BUZZY_IMAGES_APP_ID,
      imageURL,
      designRowID,
      orderRowID,
    } = typeof body === "object" ? body : JSON.parse(body);
    BUZZY_DEBUG && console.log("PRECHECK body", body);

    BUZZY_DEBUG &&
      console.log(
        "body recieved",
        typeof body === "object" ? body : JSON.parse(body)
      );

    if (!buzzyAdminToken || buzzyAdminToken !== BUZZY_API_CHECK) {
      console.log("invalid API request");
      return errorResponse("invalid buzzyAdminToken", buzzyAdminToken);
    }
    switch (type) {
      case "mockup":
        {
          if (!imageURL) {
            console.log("mockeup no imageURL");
            return errorResponse("no imageURL");
          }
          const mockupResponse = await mockup({ imageURL });
          BUZZY_DEBUG && console.log("mockupResponse", mockupResponse);
          if (!mockupResponse) {
            console.log("mockeup error");
            return errorResponse("no mockupResponse ");
          }
          const { result } = mockupResponse || {};
          const { task_key } = result || {};

          if (!task_key) {
            console.log("no task_key");
            return errorResponse("no task_key");
          }
          // wait for mockup to be ready
          let tries = 0;
          let mockupComplete = false;
          while (!mockupComplete && tries < 10) {
            tries++;
            await sleep(6000);
            const mockupTaskResponse = await mockupGetTask({
              taskKey: task_key,
            });
            if (!mockupTaskResponse) {
              console.log("mockupTasksResponse error");
              return errorResponse("no mockupTasksResponse");
            }
            const { result: mockupTaskResult } = mockupTaskResponse || {};
            BUZZY_DEBUG && console.log("mockupTaskResult", mockupTaskResult);

            const { mockups } = mockupTaskResult || {};

            if (Array.isArray(mockups) && mockups.length > 0) {
              BUZZY_DEBUG &&
                console.log("about to try update mockups", mockups);
              const { mockup_url } = mockups[0] || {};
              if (mockup_url) {
                mockupComplete = true;
                const updatedRow = await updateMicroAppDataRow({
                  rowID: designRowID,
                  authToken: BUZZY_API_TOKEN,
                  userId: BUZZY_API_USERID,
                  url: BUZZY_URL,
                  rowData: {
                    mockupUrl: mockup_url,
                    status: "complete",
                  },
                });
                return {
                  status: "success",
                  message: "mockup [100]",
                  mockup_url,
                };
              }
            }
          }

          return {
            status: "success",
            message: "mockup [101]",
          };
        }
        break;
      case "getquote":
        {
          BUZZY_DEBUG && console.log("getquote data", orderRowID);
          if (!orderRowID) {
            console.log("getquote no orderRowID");
            return errorResponse("no orderRowID");
          }

          const printfulOrderResponse = await printfulOrder({ orderRowID });

          return {
            status: "success",
            message: "getquote [100]",
          };
        }
        break;

      default:
        console.log("type not handled:", type);
        return errorResponse("no task_key");
    }
  } catch (error) {
    console.log("Lambda error[0]", error);
    return errorResponse(error);
  }
};
