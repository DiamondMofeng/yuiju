import { type ActionContext, type ActionMetadata, MajorScene } from "@yuiju/utils";
import { anywhereAction } from "./anywhere";
import { cafeAction } from "./cafe";
import { coastAction } from "./coast";
import { homeAction } from "./home";
import { parkAction } from "./park";
import { schoolAction } from "./school";
import { shopAction } from "./shop";
import { shrineAction } from "./shrine";
import { precheckAction } from "./utils";

export function getActionList(context: ActionContext) {
  let locationAction: ActionMetadata[] = [];

  const actionList = precheckAction(context);
  if (actionList) {
    return actionList;
  }

  switch (context.characterState.location.major) {
    case MajorScene.Home:
      locationAction = homeAction;
      break;
    case MajorScene.School:
      locationAction = schoolAction;
      break;
    case MajorScene.Shop:
      locationAction = shopAction;
      break;
    case MajorScene.Coast:
      locationAction = coastAction;
      break;
    case MajorScene.Cafe:
      locationAction = cafeAction;
      break;
    case MajorScene.Park:
      locationAction = parkAction;
      break;
    case MajorScene.Shrine:
      locationAction = shrineAction;
      break;
    default:
      break;
  }

  return locationAction.concat(anywhereAction).filter((action) => {
    return action.precondition(context);
  });
}
