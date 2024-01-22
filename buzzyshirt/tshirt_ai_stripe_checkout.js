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
const PRINTFUL_API_TOKEN = process.env.PRINTFUL_API_TOKEN;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const BUZZY_URL = process.env.BUZZY_URL;

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
    addressCountry,
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
        state_code: addressState,
        country_code: addressCountry,
        zip: addressPostcode,
      },
      items: [
        {
          variant_id: 10288,
          quantity: 1,
          files: [
            {
              url: designUrl,
            },
          ],
        },
      ],
    };
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
      },
    });

    return response.data; // Return the response data
  } catch (error) {
    // Handle errors
    console.error(error);
    return null;
  }
}

export const handler = async (event) => {
  // Make a request for a user with a given ID

  try {
    const { body, headers } = event;

    if (!body) {
      return errorResponse("invalid params");
    }

    BUZZY_DEBUG && console.log("PRECHECK header", event);

    const {
      url = "https://tshirt.mybuzzy.app",
      process = "genimage", // or getimages
      prompt = "A tropical beach with perfect waves.",
      buzzyAdminToken,
      type,
      data,
      _orderRowID,
      _order,
      stripeCreateCheckOutPublicKey,
      stripeCreateCheckOutSessionUrl,
      stripeCreateCheckOutSuccessUrl,
      stripeCreateCheckOutCancelUrl,
      userID,
    } = typeof body === "object" ? body : JSON.parse(body);

    switch (type) {
      case "checkout.session.completed":
        const { object } = data || {};
        const { metadata, amount_total, id: checkoutSessionID } = object || {};
        BUZZY_DEBUG &&
          console.log("checkoutSessionCompleted", { metadata, amount_total });
        const { _orderRowID: orderRowID } = metadata || {};
        if (!orderRowID) {
          return errorResponse("no metadata or orderRowID");
        }
        const orderRow = await getMicroAppDataRow(
          orderRowID,
          BUZZY_API_TOKEN,
          BUZZY_API_USERID,
          BUZZY_URL
        );
        if (!orderRow) {
          return errorResponse("no orderRow");
        }
        const { "Quote Details": quoteDetails } = orderRow || {};
        if (!quoteDetails) {
          return errorResponse("no quoteDetails");
        }
        const { costs } = quoteDetails || {};
        if (!costs) {
          return errorResponse("no costs");
        }
        const { total, currency } = costs || {};
        if (!total || !currency) {
          return errorResponse("no total or currency");
        }
        if (amount_total !== total * 100) {
          return errorResponse("amount_total not equal to total");
        }
        const updatedRow = await updateMicroAppDataRow({
          rowID: orderRowID,
          authToken: BUZZY_API_TOKEN,
          userId: BUZZY_API_USERID,
          url: BUZZY_URL,
          rowData: {
            "Quote Details": { ...quoteDetails, checkoutSessionID },
          },
        });

        return {
          status: "success",
          message: { id: response.data.id, url: response.data.url },
        };
        break;
      // ... handle other event types
      case "createcheckout":
        {
          if (!buzzyAdminToken || buzzyAdminToken !== BUZZY_API_CHECK) {
            console.log("invalid API request");
            return errorResponse("invalid buzzyAdminToken", buzzyAdminToken);
          }
          if (!_orderRowID) {
            return errorResponse("no orderRowID");
          }

          const orderRow = await getMicroAppDataRow(
            _orderRowID,
            BUZZY_API_TOKEN,
            BUZZY_API_USERID,
            BUZZY_URL
          );

          if (!orderRow) {
            console.log("createcheckout no orderRow");
            return errorResponse("no orderRow");
          }

          const { "Quote Details": quoteDetails } = orderRow || {};
          if (!quoteDetails) {
            console.log("createcheckout no quoteDetails");
            return errorResponse("no quoteDetails");
          }
          const { costs } = quoteDetails || {};

          if (!costs) {
            console.log("createcheckout no costs");
            return errorResponse("no costs");
          }
          const { total, currency } = costs || {};
          if (!total || !currency) {
            console.log("createcheckout no total currency", {
              total,
              currency,
            });
            return errorResponse("no total or currency");
          }

          const dataCheckout = {
            metadata: {
              _orderRowID,
              userID,
            },
            payment_method_types: ["card"],
            line_items: [
              {
                price_data: {
                  currency, // or your preferred currency
                  product_data: {
                    name: "Buzzy Tshirt - Total Order",
                  },
                  unit_amount: total * 100, // Amount in cents
                },
                quantity: 1,
              },
            ],
            mode: "payment",
            success_url: stripeCreateCheckOutSuccessUrl, // Replace with your URL
            cancel_url: stripeCreateCheckOutCancelUrl, // Replace with your URL
          };

          const response = await axios.post(
            "https://api.stripe.com/v1/checkout/sessions",
            dataCheckout,
            {
              headers: {
                Authorization: `Bearer ${STRIPE_SECRET_KEY}`, // Use your Stripe secret key
                "Content-Type": "application/x-www-form-urlencoded",
              },
            }
          );

          return {
            status: "success",
            message: { id: response.data.id, url: response.data.url },
          };
        }
        break;

      default:
        console.log("type not handled:", type);
        return errorResponse(`type not handled ${type}`);
    }
  } catch (error) {
    console.log("Lambda error[0]", error);
    return errorResponse(error);
  }
};
