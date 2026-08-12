import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { imgMenuLogoB64 as imgMenuLogo } from "../inlineImages";
import imgMenuProfile from "@/imports/Menu/99eb3ae505a7bf4cc9b0770dd9cd52824b1a752f.png";
import menuPaths      from "@/imports/Menu/svg-bk9npgw5mw";
import mainPaths    from "@/imports/Main피보호자/svg-jf129ggkg0";
import { SearchOverlay, RouteResultsSheet, NavigationView, searchPlaces } from "../components/NavigationFlow";
import type { Place as NavPlace, SafeRoute } from "../components/NavigationFlow";
import { jua, VWORLD_KEY, BT_PATTERN, BUILTIN_PATTERN } from "../shared/constants";
import { emergencyApi, fcmApi, getSavedUser } from "../api/client";
import { requestFcmToken } from "../firebase";
import { Screen, EmergencyState } from "../shared/types";
import { ZipRoLogo } from "../shared/ZipRoLogo";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// ─────────────────────────────────────────────
// Types & Interfaces
// ─────────────────────────────────────────────
export interface FavoritePlace {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

function getFavoritesStorageKey() {
  const user = getSavedUser();
  const accountId = user?.user_id ?? user?.userid ?? user?.username ?? "guest";
  return `zipro_favorites:${encodeURIComponent(accountId)}`;
}

function loadAccountFavorites(storageKey: string): FavoritePlace[] {
  try {
    const accountSaved = localStorage.getItem(storageKey);
    if (accountSaved) {
      const parsed = JSON.parse(accountSaved);
      return Array.isArray(parsed) ? parsed : [];
    }

    // 기존 버전의 단일 저장 키는 현재 로그인한 계정의 키로 한 번만 이전한다.
    const legacySaved = localStorage.getItem("zipro_favorites");
    if (legacySaved) {
      const parsed = JSON.parse(legacySaved);
      if (Array.isArray(parsed)) {
        localStorage.setItem(storageKey, legacySaved);
        localStorage.removeItem("zipro_favorites");
        return parsed;
      }
    }
  } catch {
    // 저장 데이터가 손상된 경우 빈 목록으로 시작한다.
  }
  return [];
}

export type MainNavMode =
  | "idle"
  | "search-origin"
  | "search-dest"
  | "route-results"
  | "navigating"
  | "favorite-map"
  | "dest-favorite-picker";


// 사용자가 제공한 곰발바닥 PNG를 데이터 URI로 포함해 별도 이미지 파일 없이 지도 마커에 사용한다.
const FAVORITE_PAW_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAE4AAABcCAYAAADAtIONAAAQAElEQVR4Aey7CdRlV3Xf+d/n3Pve++ah5ipNaMIQm7iTrO5kLXs1PTideDnD6nRsjIlXtwcgjh03bndiGyyXwTIsCwMGDEiQpOO4oS26cZPExmBsCTQEjBkMQkJCs1Sq8Zvf94Y7nJPfvl+VELYAISSStcL97nln3mfv/9l7n+FWBX2Tnxtv/Ifxlne++q/e+vZrXnHr237+/R996z+776O/8TO7t77xFekj1/1kvvnXXp5veh3htS/Nf3ztj+c/uvbH8od/9cfzh1/r4aX5pl/7J81Nr//phwkf+vDrf/raD7355/7mTcePD77JYuibAlzO2W5/16/+/VtvOP6vD5+5+lTe3fzTNN56QzPa/rvNcOvyergzOxlu2mR3W+PhljweDT1NGO2QH6ra3VU7mWgy3I7V7tbF1Wjne9J49xe0de6DVXHy9Adf948/+IHX/eRLfv/4Ty1+M0AMz+Ygt//rXzl26w2v/uXb3/HKLzbDc7/b7qz/cD08t78ClMnOpqY7W5oOdzTd3dFkd7gXRmONPT3a1WQyUjUeq55OVBHGlFWUef10NNR0vKvpZFfNdLTYjoZ/0yY7/0bF5KHfe+1PvOF9r/mJ5z2bsj0rwN1yw69efcs7XvUv82h4Zx5tXFMPN6+Ybm/oAlhjtMqFHgHaCNBGgDCZjFVVU9VVpaZp1Lat2tR26bquNZ1ONUXjxuOJJoA5Ho00cSBJVwA4AdAJcTseLmu0/Yqy3v3svz3+I//v+37xJX/52QDwGQXulrf93Mqt1//SO63a/Ewab/9v0+31xfH2usZb62jTNpq0I9eayRihEdgBuQCSx5h0J6PHKSXllMWvUm670FLmgHqd9510QI7loNYA21Q1wE9UUd5MR0Wa7v6DVNWfee/P//C7bzz+o1d2xJ+hn2cEuIwP+/g7f/kHo+mLNt35sXq0PVPt7plhhVZMzoPk2uSC014Xgpl1ophZp2UOiocL9bkFOkIi5EyakAAyxigzUwimjGamtlHdVJgtAc1t0VwPhubGdvyDxXT8iRt/7h+98vjx48+IzN8wkZtu/M35j73r+P9TjbbeXe1u7xsPNzUFrClguWlVCODalNCWnLMef9Amz//5cs9faOP1HjwfAAmEAAsa0MnQc8gdUK/yNgmQ6qaVa2M3Libe1lO1xLmaLId69CvPH33hE+965Ysv9fbfSPiGgPvY//Xav9rfPP3pZnfr+yv81BSnXmOG9XQs164GLXDQnEEHwEF5PEZqMwMI8+pO2zzh9WZ7ZZ724FrqwdMCNw+eNjP6ey85piSCujFIeb33adHUBuCausFf1mqr0V+Zn9af+O1/9qL/hWZP+33awP2Hf3XtTzWT7Y+0u1tXVmhY5cB5QNMatCwx80IzZHu8uSAh7A1nHp8XOrvpoT17rSQz2xPe+wpAzsck98hZ6OILtEKMXd7rPRHD+TGg4/l83oxzagRhGUCqqQ8UdfWef/OzLz5+/IUvLLq+X+fP3ihfR6eMj7j9ndf8Yh5v/kY73J6rXMsArHG/cn41dC3LCGwyFbGQC1kUhdwvFWVBWdwLZU9FUXblXudseOztzcyzMvtSbAa75MvyfB/6FtCIRQ860GUM7+uh6/yEn8TkZEA0V9cmKTVNEerxL13xnatvfzp+D06eQP0pJD92UfjlPB2/uhmNzbWsZh9V40cSTEmwBWAOmgezPaEjAnno9QcqewTigrjoBC47oc1MZoZSJP355wIQTiMwERHwA4AV/RkVvRmVg5kujtCMlHt7M+vI+CS6yQrAnKcEgE0zVcaNgJ7Utj/2nM073vf1at7XBdyt7zh+XZ7uvqpmzzRl1ayIx+y/WjTNGXLwnDkPAb6dd9cwF7gALMW+tkdJ69uVdifMeijUc6HRoLJXqgDgTmj8mLF4GJNgZm5xgBoVYuza92bnVAxmNZq22tqeaGeXlVRG3QAAe/LxAgyYmczj86CJx/ncA7FRgu8OwKb6e5e+YN87rn/pS2dp8pTe8FRauRy3Xn/NL1qz87PNeEc1x6CpbzbrSgEf1RKcIQfMLABAKYUA06TRAIWe7rn3MX3sU1/QF774iO594KTuvPshffIzX9R9D5xRkwu5NhYAE+gXzGRmkkxmBqmoUHibGSCIeuD+U/S9R3dD6/6HTupuaH/28w/ogYdOyWKpiEbGWHR9iyIoxqA9sFKn0WZkCcGy8JASq7Ga8Y/G8szrqXlKr1P8Cg2/VHz7Db/8k1aPX92yYk52tzUldp+W2lqtb1HZV6XcyKBmMGRmMpgt0bIhmvWpT9+j4e5U/ZkZzS3OafXgPvVmZtXv97Sxs6s77npI6xtjefteryfRN5vkQBpEXRP7mOHG9kif+ew92tyd0LanwexA+w/s09LSvObmZrQ7rnTHnQ9qPE6KRQkPESFMZkbs+DTECQ1O4JiVcS/GpEekCNSEXP3j63/i+46T/Jqvt/+qjW75V695IaBdl6YjTTHNCtNs6imT1CpjSnBAf0PzguBBvmLGnmvHrCr4/ByagAoi5IxW969qed+KZufmdOjoQc0vL6kHeBFTvf+RM5hxrRKACvIFGmaAFtEc18bhuNbDaFTZ76ukz+zcrA4dOaRi0Nf+wwe0sm9VZa+UZLr3wZPKVqiAjkFDCmiapJSV8HGkpCzSBCY9w7ilRoG6oq6vedtL/87f79p8lZ+vCtwH337dwTAd/4tUjfoOWM1B2zeXvjdiXCXUgkkTY6thmXcTc4ZkUSUCnjixJguB2Y9aXF3VIkDNommBssFggLYc0PK+/XKBXUMfePC0Mn0dtBiiQjAVRRSkdT/mbWiRg7gCrWMXXQzofRVloYWVlY5OH9pOy/s/fOKsYtFTjKXMTJDqYskEPoTc0Xcgk4OmrOgA5mRFO3nTm3/sf75IX+UJX6VO82H462k6vrxC0+rpSN3+zKVgcFmULKhTOvNkwGiJY6TWNEFDzq1vadDvaX5hodM4X0XLXl+zMwM5cCFGLSwtaoH6Xq9UC7FTZzZlLmzE+4SgEKNOntpALFMJrbnFBS0DVAyFemUPM12SM2G0XaBuMDurEjCHmHPdmmIsO35ASiFGRYLSnuZlxgshUi8lNMDzJslyvrTIo7eR96ye7AlPVuhlt93wq/9I1fCHWgeNhaDmEF2zjHczhD/LqFm3KqF6DKAuwFBGxAwrZ89tyWCqLEstY0YDVs8ZzKpAaxaXVhCuFJNLywCo8+r1eioB77HTa0xAUCgKFZRZ7Onsxo5iGdUH8IXFJQWL8gP/7PyC5hYWoIF8aP/c/CJavSgzIwRtbDgPoeNIPM5vy0WAH82MfMui4AH8FGOhgFr6gkGk2Nbf99Yf/ds/QrMnfZ8UuI+989pDudq+tp1OzbceNZtb3w/lJEWnKpMPFkIQPH6JsHnSYKDQGsK6+QVMbW5hXrNoQghRfUy06AMS8ez8nByMfQf249zn6edCmja3dmUAHPF3G9u7ahk4oilOYwng5ufnNcNCUzApFhGY4LR6ThNzDRHg4W13OJXzoBgF2uqYDbYXy2RmErA6eJ18CGVmXVOamdXT6976w//DPj3JE56kjFuGyc/kZnxxPd2Vb26n0wpVRo8MwVyl0SzJWIuy1OV9oWC1otwoDwg9GsE0zAeAS5S7UG2b5YKUPYDr9eVa1u8PFEPQHCCGTmDTCDNzzfT89s5IDprTsRg7oDNSJcD0spKx+tCTmYpeqQCY4jF4HU2nCpi0qMs4tmzwL5Po75bhyQwdoa0tLijRBoFkZgoxEmulzfZGPcnzF4C76Y3HL0vN5BUNWlb5CsqCwDjYfSK0EDPGJYSokMVj8r9oQSHsaSIN5JeQZiYRiqLHZLQqBz357Lbs//qYYsXuPZQFbbMc2AJmI2GEfzRFKQe2FrUi4PvRzReFCefgXr8vi4X8aaDBlMm6sbMX0b4kT3eRN4MFQiwpyHtpWplRJueXQLsQAqXCTSTJPBBlwUXzotf90Pd+h/7cs9f6CYU2qH8hVeOyWwwQsPFzHRoDDZkxYznLB9kbzrp0lzcGZdYEE27HkY0nsnT1KdXy9j20YXl5WSWCTyZT9cueGnbvjftLSQEwY2RRcC2ATmasRIghdsC2LQD3BkxCkm9HYgjMkcmBLOkr+GyxAJw740lGfXJa0BBPIt7TKrg8n/YxqNKFciPTBbQPVmSmcqDdl1P8ZW94Yu4j//KVF1s1/rst2tYws34V4z33QmA2nCQxAGUYcjAzDDgNH5hB4IgXp9vv9WT8Jdr6tY5rWo3Jj7jyHnP93bWnY0bQTJtEnxiCDLQtqhPEBfUxfGIKzLDEh024skpoWT2t+RZRyU0QMqowy24cro/koBNKtDlD1yctseUwMzkt50s8zrsHLyPbvZmVODUZzrNiNMow6pRf8voffOF+Mo+/4fGUJ8bt98PNocxNauIOy4sECfEwZjdoKEpZZyYBwkFmQQGNCDHKQiGz0AmzwAmhRQMsS+PRWCUa2ECXHuoCNCZodCAuMcXEDGfBaJJKyhgSOmgYdB0Iz9e4jRIAISBf/Vxo8NF4uNu1DdBpm1qJSXV686zCiYkRtIuiUFFG+XiKQZ7vQcvjjI+TgrtrXIkbPkygJu6KIrJZjIuI8tN6whMupLlaKaxp/qkD1gVMKFqQq30wIVJQzohAMMpDjAqxUMDcLJaKKHQgzmJ+GeXA8iILC1qB5k74BjDaHckfX6EnaF3rIFpQy73dCA3cRfgx7RryM7MDhGhFpZYWZjHnVmP6J7SnRrMy9M2sE94BijFyqplquLXN/nHiOGHOLX1n4J+FC3RDgN/QU1H2CQNZ7ClbqQjPIQRnjX6J4BpGtgMzA6cImc1xfhGlj797Pcj+d0fH/3Wux5e07NXcebtpQUXRjMFNCdR4ZSGq8OucwZxib04FoZyZVzmYVwQ8CwXUTItoXAniftKYjiY6d+6sRmjeZFIpIbhrYwMQE0CbokkZrXDXUGFqDlbCHFu0Z35xppuACvfh4E4ArsLkO37oUzExY788pe1wZ6jRcAhoNf6z0PzsjJSlWPQV+7OKg1n12K704XcvpoxVvcAFhKJkyqUixo5/l9WDK06ESBHyFa950d96IZXdG7pfftpR/l9btMxX0xrmAtqQsbMOeCfGrDjxotdTskKnzw115z2P6FN33KfPcB794n2Pdgd2K6JCDDCcdYzz6AQhK0wyNYlRRF1UQEtbuHL/E2KU+yYXvsI99HpRvTICVoWGZ830Sw0YczptNOHuL2OGEfojPlBPK9eu1LWr2dh2kwSNad3q6OF9CiHI0KjYm9XmsNYJTiB3c7NyF7cpDzx6TqfXdyTqS7/Tc2UAxGwmRzDDX8LMM75xD8pkvTT5ezr/BI9vvPHGGNV+nwuSAK9lJmHHqwgQ4rdAxUt8xrmNoT575wM6dXZDKI7KslSk9y6CPXLinO66+2Ftbg+Zo8RZdFEH9i2pQst2dra1tbWpId9Sx5xGpqyqL0CTZwAAEABJREFUY7Rlc/0cGp00wVQNM73y0sNKmHFqp/JQsRhcdGyVdIMp7uCCp5jjLmAlJRhwN+A+dBe629CfQPfA6rL2rS7JYpDzdde9j+j0mQ2N4dHwtb2ZUr6n2xlOdP/Dp7XFnrPsDRQBruix1bEgMyN4HJA+4/FMOdUvOX7+qt1LdWjtCy9Qqo9kEE6Yj2FinSl4Fyfgs9Lva7hb6/6HTivA0MLSkg4ePazDFx3VoWNHOXMuqMc+LdHemTl9blOFRV3+nKNaWZqXm+vmuTWtnTmtXb7gP/boQzr76KPa3drSqVOnVGOKV1x+FG2TEu7CTSRhfuLqarYfdclF+0k2OvnICT32yKN6jL4PP/SgNtbXdIb+586d6z5oL84NdOzQCn6x0cbmUA9yUxJjwfZlAI/z3S3Kyr59xCtaWl1GlqjTZzc15ionRHQL2RzwbAJcoz4AIKAhl9p2X72ivy6eQIChyf+YUfUWRlu0LWMOXTkzKgiEGGWAd9/9J9Tr9WBiDiYWFYqeBnPzHOLndfDwIS0tL6vX7ymihY+cPKchvo1p0mWXHdHB/YuMUwHUjk4/ekIj/JGDtr2xIaFpVwDw/EzB/FXKmEnDBLpxZ3hxIFfme7rs4v2CiHY2d7TDOXRIvLm20a3aLTSOHFjRJcf2K+Efh8ORHnz4pEomvOSMPLe4qFXOzIsc//yU0qIkkVXV+S1wLyfPnAOkQjFGucxmpojsQtcwCUWUKcTCBtZ+t3gCgfLquxts2QdUbpVlHfNmHtM7RM6e2zjdJN/hr+7fp0VuNQaY7gDHKnq4ye47cEC+u+8BXFn09ACMR2MIBDlycFVXX3mRDqENczN9zfQKLS7M6OKLDun533aZZmejHKBM2xiCyqJUwRbCvD8TmDDf2b7p6ssP6+ihJc3N9IQr1Gyv0KHVef2l516s/Stzymy2xfPIiTMKMars9bS0sqxFrrQGLAwRuswLk72ouYVFHTx8WH2AbRljhJkbYwfkNTOJVzweBToF0kH2PUQKNx0/XuS2/Y6W1azFvzUwLnqYBUmmwGwYDKyv7SjEoBKN6gNWiyb0mbEA1ZnZOc1w6Hbw/MpnAVB7SFXjpNe2hsoMWqPNGaGWF/q6+MiyLjm6oqOHl7QwF6U0kbWtojObpSnaP8F0xtNW0zopxwIQI3NaKzcTLdPn6IE5XQqdowfn2HYUaifDTlvFZnoXTff+JRM4tzjfTeYMPBaANsNlg8cL8wsqy558LJ+kYEHDnbGM2GTdeCKGHZl5CTmOYiG3zz3+D184H9r9utxSutSFypipFBBUhKwQAI/zInJrB9V34q5lM3OzmpufV4/ZLMsCNY4Qj+QH6rPsL62sEPe7wc+tbbmyq0VjDH8V3H+dT4u4pBZ+tL65qzvvPaXP3nNKd99/Tvc9vKEHH9kgXtNd95zUPQ+c1drWRBH+MGjOya0S/RsWj5btTE2cWb19kk6eXgeUUm6iC5io811gASVmKwto9yy8lVha1rzXoxxCAyYsVmbIwkS1TIBk/AUF6qKRIzDw4ZjSkSCrjuGZzc00AVxGZWkig4AEiIEmqG6LRuwBSS35TNsCUwoWvICbEqlxhM06APcdOChvv4XGtbQNlmXEBlBy/4J594pCOyw4d3zhYT14YkNNoi97rwHfD2Y8kParpBINr6g7fW5Xn7/vrLbYWhQxiAUSDuGScQO0s9OFt9F4qsiELq+uAGBPRdkTbKlB653nknHNGIvyfgGAkkyCrcQvHEIrUA/LMqMmSxZM/pebNnBkfl4Ibf2cxICJxg4ObSSEMjN+SRqBN0ZMha4t5gyfcgbMTJHZKRi8gSnxNPjIoud6JLnjFX1qzM59hJmRkyISR5h+5NSWvvjgKSWLWpyf0b79mC+r9GVXXaVLr7pSl159tfYdOawDhw9qBR81x4pZ9go9emZHp9bGCvSL0HQtk1O2gB9uSe5p1ezcnGK/p44fBCsw3RijGtwS3WRmMlxOgj8HKaAk2bFAwAQe2RGgHw2VKBN5oz7X1beH1NplLZ15JZlEyAQH0TsLeFPbctHYV7chhoAfqFs00xlOdMyEXq8vs71Z9Lu4PtrijFoMndlnBcUQujYRs3nk1CZftkbQndXC8oIOX3yJrvqOF+jYpVew+u3Xscsu18VXXKkrn/tt+rYXfKeu+vZv1/5Dh3Hyi5oH5HX80bltzsC9UgVgmFlHu4VfhlGCT5IKIapiU9yw+GXMzwFyIE3+JOoq1fj1Vlk9aLliJORtWKVbwHNsDIIm/kwd3ZTbQ6FtpksOEOPQ1YnJm3TCisc7JwgvzM8qM3ANExU+pYWw9+sGQMtca+uqxtlW+LeSWW3lZYwFPXUhI1wJwKc3drvr8AEaNL+4oIsufY6OXnKp3IQCJ+sYg6bDLe2cPa2G/Z3gzFfvy69+LsA+RzPzc5qZ7WuNj9Gbw0ouWHTzw1dFgsxUYAVFiHIFyAhXkvfYQ3cmRpYJctT4NS9L5GdYXZ1nGJePmVAODw1WBkm5dnu52Ntjue1chrFMzjt1QCXU3bsyYO7SWasrS9BjhhjI914+uP+TKrMgWZT7EfdxFdc9LUw0OGozYwKS+j18DCOFGDVpkk6cXNeAXfoArTx08aW65LnPVxz0tHnutFpMPqEdU77fCgCdrwnfPCouAKp6qn2HDqJ5hzSY6auHs39sbVd1BijMMEsqABBxZGZM4rTjuWayGybaGL9CCRINKrSqBZgN9pFN3cjoO+gXar0emTM0HVBXlpa2VPMGggltXgnKNms0Mh+V3mbWCSvaeEc8Jm+jMgoTmlfFOXa8O9bu5iaMVZoA0Gi0qzEfqRNC1wjnWPoGswGkAaBBAMaCLJQccc4qIFwfoFYOHtJBPvP5R+6EtlqAHZg2CDQwC4MSZS2TVeCrepiS0zqIyR4+ehHgFwBV6iyrrQp8MDsAH9f3eC0AWBCyuGDq+JtyoTDmlsUnPTCRw+0dblUmmrJtmoOfTB8H0d1TDT/0lk8cPx0d5ykDNgj1Q0ZNHCAy8kLJEDDwy4A50ycroaoVAB05sIoSGINNtcO5cLi9pakDhi/wWXUas/PznEkp53w65Px57PD+zgFHZnuD7we7lPfLvga0O3z0mBJ028lYia3KLHurppqoAfz+7DxjOR8m33SLMQwkKjQvol3LbLZnMdkegI7GDV/xWxmz7zIsL8/B3za8TdGgVhXAi6dhUgRgiQk+ybGtA47zq7C2leV5xuXUQpuGeiE55AQEJDP8eWiUcEs5pUFoUz3NOHefXTODPO2Sh0wnlBqzS8x+i7ob7a647JgaZmOM1q1zVbTDWbPGV0zRxMxs+HeK0daO1s6e0+xggPPvy0JQMtMjj51Tvyw0GJRyrSlJ+x4sO3c+T4AzmFlQiKViUTJ+huGkGAs5Zy3+LgOwu4GAlSyx0g44pvU5y548u6UQChjP3XXSoFdwhj2jzfX17i4vwEMNgA1hCM+7XDr4lZa7okuPHGACa7VMomt+Cx8Q6sbnh9f5aIkl4GDrlVrGtyrLn/O/gJMzswcITrSF0QxwGR+R6olKpuHqK48hSOa8OdYaZ7zTj53U+unTOv3YCc6hj2p97ayQRZce29fNuGFGDzxyltkSx5uB5jlZHMBM/dNjwjyc4RCijODbB4+loAB4MQZlBKkRqkETEpzXu0MkaLS87wDHqRVoAjIiPHp6a08w+D16aFkzpWntFOCtrevkw4/C30mdeeyUtje3NeZ0YYx9ZP+yGuRquklBYwxCTGRiTJ/QCyGBR4PlJWiT3ArANTRmL5v7iCwzY3MsAM9dSBBwiV293WRbBgm50lWcGY8dXMYMszbXN7Rxbl1bONop/u4Y+7HLLzoorEJBpocfPa219W3N9PuccZd0lFV0Mtru+oYAMAwlnhDhgfGpkDMcSEe0rUHbPW2kezNzMgBFBxQRcnVlFeAG3KoU3N6MtYUlJMzN+x/iYuHQ6oImo6HOYQF+IeA8ZgDbvzSnIwcWlDjC+amj9YnxgKJ4f9jpJt3pJJBK4JCI0R81VbsZZHHX+TaDC4TEtDvAvKNRESnLdHIzTQiQmXVX94R5Ls0VuuqSffrOq47peVwJPf+KY7ri2H6tLA7AuvGeeuzMGqvommZY6mdmZ/Wcq5/HPmyBOlPiN/b6KllhDQAT2tRw8cmwcnaMme/GtqjYGygW7CVhzNtmGK3Qkl7Z6yZjhlV2hoP/GpeTm2xTWqcFv7OY8qVHVnQlfF52ZFmePrI8q17M+MCxavxrC50av9qiTS3I7IGV5EAlZGdI0kktwCXGTSGshWQ64YwmBXxElHkruE7OtKc9ZnvQAlhmJt1kEjPmWuC+rfJLyelIuR6rIe3toK0Ye1x2bukxrpdmZ2c4287p4suvlH/VDzF0jCQYzQiXPcZFFP1eN2nRIrwEjmDObFKBqaOC1CXnSIFVGba6NnwM4BC/oiU20TOA13fwNre1sbEtsQOuuPHw1bQmdnOc8r3D/zPJFC1s8MsN/nrisQPmwACUA+cgpi7PsBlSlDeeJ23Z1oNk9zpaFouOEbMOOvnjBBIdPO7CXqEygyTsPTOrLXGNw22foOIWgh559JQeO3WWxWHAoXqgA4cO6eCRI8zwLqo+ZaWcUQ9tgw8FgLEQ5bQioLRMkODDHB3G9HzNId4FT4zpba3o0W+G2lIx9LS0tNIdy2bYi7lL2OR2d21rl3ojSInJadmvNZhjDVC+rXIlaOBfzEfqQMkMG7r2IXwpTmDge1bXYmeJpneHUVM9lLO1HXmY9ZntQMq504oMGc8TdYJ52gn5jPigDSC6OXk5rlKhLPXY2U1OBtsdYHNsMS5/3nfoossvl2unj5MAxkHIaHGIQQU+q4W5YEEOXBFLxs7QKuSP94sBQWibUWc3q27ioIOktE0azC5o38HDnHdXNTNTagbt3WEBWB+OFWN0MoiW5Xw7AAnpPfa88+7ANoDoZRlBzKLMTJ2/JfLyhj5122Y23PeHuVYnk3RaPElBCeZzZgBnipjROsYSgtn5OnhXJu/mbGQCQhmhLPuacId2Cr/mPm1ufp6F4DIdPHxIzrwL7QCVaJr3cRoB5sxMECRIMRSyYCrRvBiiSKooewicJRg3MzglwFugPmPi5WBGCT76cwtaPXhUyytLANlj29PXaFxxFs3ythYEPZOZyeVx7YVY1zcbKcr5VYZ2hq4o88jbsZfndoVRzHYaiw+Ev3P8hlGWPZIkZSh3MWmzwn8lJ2ZRtJE/2DdpJ6CuKiGM11nEdADuYW5e+72e+uzhjl1ymS665BK1mFnCl9XjoRwsfhRBpGkrmBYMNZ0peV1yTp3hLAl+4EohxG6siOb0AalEI43+3jagrT1WWm+T8L190vsPHdPiwpxm+2W3b9zYGqlgIoI5HetAE092gIgTvlBiUDEaZUS0gQHehII0oMarGo3Mbb7vhps/eY45kM/mHxoAyLxzABiKSTphQcjMPFJLmxYf42ioAUQAABAASURBVLJ5SOQTU5Xk7aNG7MIrAHIzWVpe1v5DRzRle5LR3gRIBWbszLcV+8RO4IFCCDJAyHBbIGjNycHN0P3eHj8IYybf3/mJwWhf9EqV3SpbyPt7O1+dK76v+kLSZ/Xet/9A5yp6vciRqladGCEGJeRxucwQkDchj5l1dMjKH48p8mQXGtyRmynASKY7xRMIakv7BPJLtHbGskxOUDyJCh+oBfkLZZ5PIMeYtBDMEFLmo/OmCsApOPcdvugSRWa5ZdtitE0sHrMLKypnWRQIDQtKzggC3cC4/V5fMRSKMaqbJcozG/EQC5VloYLY4DwEfhMcEkfom4XOdzoTETArtheu3YO5Ba0c2C/nJ9J3xFFPtLUQ5ZMHfq4wUJScZmLxcLkMiTLB6WZZpyx1k9WgzV6fFW6lWsF/5lcvuRkzbbxTCIUCHcwQioJshjllydMII55E3IFITFYRZkS7CWBEBC8BYXF1v2o+IBeDviJf0EM5UAu3bo4V25eZhUUJmgbrxljiaQCXSBFt9JWvAwOhlY1L6ql83JbZ93jCd9QJnxmzb8jpFPGDPcwYNtSy6PT8w0wIKuGnKIIqvl1Ep0UDyIlI54ft6AYzykwJHrsgqcE0K8arKcvYKj4a7PIHqAIjfr/3nx7fbmQ3keSl2iSLAAde4sk+w6S9zGAmEIoCzaBOMu2VRTUs9zGYitJXxSTXnNZnClPNbatIOY0pNyVoNjCFMiJo600VnC6gx16pDB0fr4H5lv4J9W6deTp4uz7AlHx9NwXBmszUPaHoqdcbiNlWw2baQpRBl9Wwo+8NjbZeFoy+gEKW8bM8dtpm8IcGJsZt0LYWH5hQEgD//G/eftdDPlDwn70Qf88r5d0h6KYpngSjUJUXA6k87wO4EGYm/5bgdc5EciYo6/d6ilDOzj1iNZ3fqpXRSE+bmTKb6oLFBE1XZozIRBjjZhg2QO0BoCGwmckde0QLxZOYCBeox1c1qlSx8GQ0LNWsntVIZnBHPz8RiKT5BHgZvEmBIoOKFCjj7dJP/An0hSFleHDQGiasgr5PXs7l711oGy4k6oWZ38oWJ0ZHQ70ZoauyzOSBNvLLwckQSuT9CmdvYJPn/Vq9pJ/zV+FnRphRixl5mwgIoSyBMSnSpuz3VZQ9NGKkhHk2CC06tudBmdLf+2UfJ4ZuXBnaATM1O/1M2zGLDsRUcv1U9NEwwB+woiY01Pnxs3BRFjJDDNpb8ITIE2epZYKcTqBBAiTxhBj53XtdCaZY0BSraGhbJzx1ju/eq5UeB+6Hfv7tG6x1f+jEDPAUSlkounZmJvF2gpD2NuLJoJlh2IX2ul4fcHwQdubDdS4sQ1DZnwOcpBCjkyDdyvm0WMr9UMsZMUQTfOmCNlrY82ltp6mNnHExTrAgN/cGgCEkn0Q7z4OVpaa+qroWw0PLN1w/GbRoS8LkihjksQdnJDuYJBAH/IPMEFD+IBV1DTTwDHIfh67IYvjc2z9+x+e8hYfgPxdCjuWb3TNBRfSFJa+BtQsZ2yPug3qNMHoHwQVomen5AQsAWtKgQesbm0qKNDG5xiVGz6J/lhquwplyzS2uaGH1AKWUQ6hACyGJIPSDjuhvkgzAAoL3oO9t+r0+bZhY+Km42Jxwzb6zdkYl5S0H9pbJ8O8NFRNYs0Vq8FOzaGWL9rTwkTraUiY28xF8DNOeXDDIeE1rqqXuvJxd/UJ4E1kq+eUNhMff4XMGH2lz+LS3U0cwIHiUnqh5tPYBnAGSygye0IbMrM7Pz4JHq4p9mpvbmKvqln1dYvYMZhKqH2KpBpBhWxG6Xq7z7NTUt1xjD7lZrgBgykF8h0vH4dY6Zj1Ri49s0UKn3dHMLawVaGFfJR/CEzyMADFh/g7SiCumGno+aYMyMm6NoiY/RSmEIIsExs4wYGYd7ykZ/Dfy/i3fTzI8GQeEfm/md13eCyFcSHj8spfdwDDlu5n8jrCXkRA05WDllNQCgqcZC9VP8tgH8RU1kFle5P4L4CasaKdOPMzF5oMabW2oQQszgmaE6jH7zvR4vK2KG5UJX7Qmw201gDIZ72iMj5twJe80asBKlNfTXW2vn1LFPV7LNqdhS+N9jUXGJy01U+qGSnzdn6JprvH+YXqKRAt8TRPmnTHbTOwLn8th8GsI6S6ASJ728hqtrAh10yIfrWK88U03f2bT21wIXwacF96/dNUbwec+t06LURnUcnCtAxbS3kb4IAe0SyvLAU3MdoWA+1YWVPi+CRMZbe9q7dwal5ynNdre1O7GGjevuxpurhE2NOEm180pW9Rw46zOPPqQTj30ELe2p3SW2+SzJ0/oNOHM2TM6zQ3ziL3bcHtbyNRdTjaYpAsXQqEpi8VktKOKMv8nX5uMPfJ/9g/P82zIG7TcQ8Y6WidAuQhmAOPCIodZUFUl1Ti3qWsbbZFut+q3v7En65d+/wJwx48fTzkUr0w5g5kp+u48lsoQFY+5ejOY8GAOVs6JWW7UolENK55r1uEDK4CZtTuact8/0frZNZ09fUprmxvawvS2+YizvbnOtfsZPfbQA3rs4Qd1+tQ5bW0OtY3AQz7qbPOx2dO73G7sbFFO3dq5bU4nG7R9TJt81xiOp3yU2eR29zS3v6O9upNntbOzq12ulRqsYx8fblrXRkw/oW3OOlaqQCKiGHKdEOBhZq5p7tdq+nnfxI69CcW177r53kcR/cvevwCc1z6w8pfe2yreRD8l1M/LDK3ICkoMmNFpM1MIJiI5eK7iDlqFmeV2qouOrKrPR5kh4A1Hlba2R2jeus4B4DoadPbEY4B5Whtcu28C0haC7nKT0bZZvbLgQ09J6JGO8JA1pm57OAKUEQDvAtyWzpw8vRdOnORqflObfO7b3p1oZ7dSwQQf5MuV31RPWUB8dW0BxOVxnqUsz0smTzP/qjBrP9NOqkawoWzF3aHsv4MGf+F9UuBc6xTST9HZFQ9gMkQYwIECPHSRMobLWalT+wvppvtaVOPfpvio1cVZHTmwrF6v6ATfAZxtANwGKAdrh1sLB8QnYJVvAIf3L2l1aaBBGcRLyKRNS3M9HcAFLLP4lGw7asxuZ6fS1tZYW2jkFmBtQ3s0aiQLWl2c19J8n2PamGuusWqsIcNrBp2EZpmZeAkGeEkNdVNoTjHRirhFJpQkt734yrff+rkNPcnzpMB5ux95y/vvbHJxvAW9LP5MaJvrdZSFCHCUMaCioREteyqYTlm+SDTu0GHAd+98uNXyXF/+z0sdxH2rC1oG0NWVOR0+uKTD+xa1NFvK23n7KR+MGxaMmtDiMxuuvL2sZgsT2ZvNF1mrCzP0W9D+lXk54CvzM9oH8IdW57XCN4aYG9WcKHwCG9yHa1bCTHG9QhHhNyvJZIBsZh14XE5yg5IAukI2KRblb19/2xfep6/wfEXgvP3L3vH/v6aN8RPZAersUwwoYDQZHAQzZUyZHAxdIAVTmEQLcImw5/smqlkFGz9JsKo6SMYK16CVU7YcNSDV3KK4mdeA3rhjxmySmwz5li2Nm9uEDa7HlX832N1Rhp7wXcaVlQC5YisyZZGYAnLlgLO67oGW1MBTlknwzNttSToefbKT2OimzlQzitIq3F+r+Fl9leeCtF+xyUjN97fZNjrsspQcqG6mohJ8gCJ9GZm6zHajAZCMqif2P60HQKgRosLPNIRqhOmwv/O8g9AATD3hnImjbzDxBEgNoSZMAcWFq0j7itiVAYbv4yoHEQAdbE9PPE1ddT44DcG08+sTb2YCI3UTjckaGZN1gLpvq5gkH8OtNZf9H3jH7Z89g2Bf8f2awL3iHX/wYFb/JSwUuIIocRQTaDlDQgszwXKQ5zPMREDtZhmAWwROzHSDuSQ0qAaYBn9TA8gUDctNK69rzrdzGl1f+nja6bVMgnJGwAZf5aEmrlUB+IXgAtdM2IW807gQXHIz8wgyWWamEBCbom4VbYSJEnzMVjnF/s9ff9sdf6qv8UDha7Sg+uXvev/v1zm+sq2rLJRLgAUHvGHPRBHswqzSXL6iwQL1wn80hFYOoAFsAiwR55TkGlTje0R/D74xNTOZC5YlB68DgLYiL372ylJXt5duO/q5hTUCygSprnEXmwk+rAPLLFAmJfa1DW2dlUmd8Gs126mUGwvX3fCxO9+op/A8JeCcztql/83rG/V+pW1bDJKSEBHDuuCC+iyakYfzBGeZeC/QlteF9IAcndACPHmGuuzA0ffL8pTLBSVmTJk57UxOpNU93s+D022h52Q8JNLeR/I+4nlCP+i0lLu2Va3Q5KSmaQEt/n83/MkXfw6W9hrT66u9Txk436L89G9/8Jomlq9lnOyMthaVANBYriJBUPNFowvBZEZw7YGD7FpjJHgpZuazMgJyU4QSmxL1nm+Ia4LHGfAFnchGtasHlUx4YhpyXd/I6m4hKxamcL6Pj2O2N6j38+B8V7iGaZ01xYVUKEJWeNvhj9/9AxJ6wM9TeRH1qTT7Upv//bc++Mo6xF+pG5YCBPfpSQaZgBkoKMSoeD6kJwhp1DOzagGlpV+CJNUiKe3JRgyAFJqZMmWZWOcfF9qTHnvwtIcWb+5xwvRcbgc10C+GAB9BnjcL6vhksBZfO2myxsRTQKsVb3zrx+/5qeNi/pzQUwzhKbb7smb/x2//0TW19X4GhZgmmVoPGVIwaCGSQ2p/yXdCIogzbmbylTghRpcPNIJyC5g1xDLZrj1l/nraDPo4bk+7O/ByM5MZtDqwvEQdxW5symWeJzAJgTFaFpiWtr56TvBpNekpSE9aXfu22+580fnme4Se4i/SPsWWf67Z//meD78phfLFTbJz7mQrZjPRJhE7kETqAGIEB6R1YBACWWgFq/y2ZLyNmbmsSCqZmR5/SCdANfMy0wXwYoSoN3I7J3h5dvrn25qZjLGcNgS7fhVboxEH+BGaxs5jvQm9l1//sbuvcTJPJ5zn4Ol0lV7x7g+/b9dm/9qkCZ9vW1Odg1jdO8AcRDODsAciXgchAxaS8OYuUNzFZnusmO21d42kgrdLdbH39/YNM+V09vqYzEz8yILTMLRPmOhev6bTNmmKeU4Abdzovl3F73n7Rz93g9Q1Jfr6Xx/p6+/1hB6vevfvP7S6Ovyv2ti7NqXgMqlB3RJqlhSQZ08QM+vSZna+tykgqJl15Q7EhSCeQLnnSXageSwZgHRTIn98MclkvV1KmW0GOkYBL+2yfKcznbYas3yiZehcuH5n0P63N9zy2U95/28khG+k84W+L7vhk/U//50/flWKvRdUKdzWpJibXCpbifYFJUDMNAaibo49vZfIcuETJpZxfvk8CLkDKCslDxTS93FwoOXlns/iD1MVIDvQuC6xaKlukxoyEwDbnbZ5WDV/WrXFf/+WW+98+W/98T0nIPcNv88IcBe4+Oe/8+G7fuF9t35XHct/gNZ9gRNBrjCRBs1rc2QR8WCsrEJk2zNrhG4dNKFNaGACGGTuBD9v1QDjNGzsAAACg0lEQVSork+bMukseRvSNaEF16ZJaprcAVZRPQKw8TTlSWsnJhZ//M/Kw3/jzbf9WfcF/gKv32j8jAJ3gZlXvfcjvzstjv7licqXsOz+Wcu3Q4IqpKxaTAggaxe4NdWA1lpQY1ENgCQAdG1pSYOHWvebrcRE0NbByaqSoBX26khPanX/f4I7BU4jKY+qdO+w1csnM7PPf+tH7/gXN998s7veC+w9I/GzApxzdvy9762uef+t7z7+7//kO8fqfVeV83twzusNdkbYEx7taAjIrhZzpQqtAVjXJNStpmLqYFPnzt0XIAd+Sh56gMcmtnUgUx7XqUHR3jPt9b73jR+98+o34/zf8oGPbzsvz0Z41oB7IrPXvv+jtx//d3/y4ovPhcNjK74bLF5dt/nj00ldt9MqVxz+a9/Nc5Pi24YKhz71NCpUsYK66VVez8He2zVVneuqJZnualr7zWku/9aZhXrfdR/53Ivf+MFP/QHWz3Q8kYNnPv1NAe4C2y/75Cfr6z7wp7e95oOf/qXX/eFn/vrsfG95XMx8V81+sM7htVXKvzNN9gdVm26tZZ+cpPzpacofq7N9qM7xxkrhTVMV/2So+L11tbD/Dbd8/vlv+OjnfvItH/2zD/3fH7j3WdOuC/w/Mf6mAvfEgT19/N99cvSGD33i9uv+8NPv+bU/+swv/PrNd7zoDTd/7m//+i2f/+5fv/mOv/YbH7nzrxD+xltu+fz/9Jbb7vyBt9x21yveeuvn33b9rXf+wVs+/uyZofP2tcJ/UuC+FnP/Odd/C7inOTvfAu5bwD1NBJ5mt29p3LeAe5oIPM1u39K4bwH3NBF4mt2+pXH/JQL3NGV+Rrr9RwAAAP//aHVzMAAAAAZJREFUAwC9U2uZOFr0TAAAAABJRU5ErkJggg==";

/**
 * 사용자가 입력한 약칭을 실제 장소명 후보로 확장한다.
 * 예: "성신여자대" → "성신여자대학교", "성신여자대학교"
 */
function makePlaceQueryVariants(query: string): string[] {
  const q = query.trim().replace(/\s+/g, " ");
  const variants = new Set([q]);

  if (q.endsWith("대")) variants.add(`${q}학교`);
  if (q.endsWith("대학")) variants.add(`${q}교`);
  if (q.endsWith("여대")) variants.add(`${q.slice(0, -2)}여자대학교`);
  if (q.endsWith("여대역")) variants.add(`${q.slice(0, -3)}여자대학교역`);

  return [...variants].filter(Boolean);
}

/**
 * 즐겨찾기 지도 전용 장소 검색입니다.
 * 앱 내부 연관 장소와 온라인 지오코딩 결과를 합쳐 약칭도 빠르게 찾아낸다.
 */
async function searchFavoritePlaces(query: string): Promise<NavPlace[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const queryVariants = makePlaceQueryVariants(q);
  // NavigationFlow에 저장된 주요 장소는 부분 입력에도 즉시 결과를 준다.
  const local = queryVariants.flatMap((term) => searchPlaces(term));

  try {
    const remoteGroups = await Promise.all(queryVariants.map(async (term) => {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(term)}&format=json&limit=8&accept-language=ko&countrycodes=kr`;
      const response = await fetch(url, {
        headers: { "Accept-Language": "ko" },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return [] as NavPlace[];

      const items = await response.json() as Array<{
        display_name?: string;
        lat?: string;
        lon?: string;
      }>;
      return items
        .map((item) => {
          const lat = Number(item.lat);
          const lng = Number(item.lon);
          const parts = (item.display_name ?? "").split(",");
          return {
            name: parts[0]?.trim() || term,
            address: parts.slice(0, 3).join(",").trim() || term,
            lat,
            lng,
          };
        })
        .filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng));
    }));

    const unique = new Map<string, NavPlace>();
    [...local, ...remoteGroups.flat()].forEach((place) => {
      const key = `${place.name}|${place.lat.toFixed(5)}|${place.lng.toFixed(5)}`;
      if (!unique.has(key)) unique.set(key, place);
    });
    return [...unique.values()].slice(0, 8);
  } catch {
    return local.slice(0, 8);
  }
}

// ─────────────────────────────────────────────
// SOS Alarm Engine
// ─────────────────────────────────────────────
class SosAlarmEngine {
  private ctx: AudioContext | null = null;
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private lfo: OscillatorNode | null = null;
  private lfoGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private micStream: MediaStream | null = null;
  private _running = false;

  get running() { return this._running; }

  async start() {
    if (this._running) return;
    this._running = true;

    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    if (this.ctx.state !== "running") await this.ctx.resume();

    if (typeof (this.ctx as any).setSinkId !== "function") {
      try {
        this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch { /* mic denied */ }
    } else {
      try {
        const ctxAny = this.ctx as any;
        let targetId = "";
        if (navigator.mediaDevices?.enumerateDevices) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const outputs = devices.filter(d => d.kind === "audiooutput");
          const builtin = outputs.find(d => BUILTIN_PATTERN.test(d.label) && !BT_PATTERN.test(d.label))
                     ?? outputs.find(d => !BT_PATTERN.test(d.label) && d.deviceId !== "default" && d.deviceId !== "");
          if (builtin) targetId = builtin.deviceId;
        }
        await ctxAny.setSinkId(targetId).catch(() => {});
      } catch { /* unsupported */ }
    }

    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -3;
    this.compressor.knee.value = 0;
    this.compressor.ratio.value = 20;
    this.compressor.attack.value = 0.001;
    this.compressor.release.value = 0.05;
    this.compressor.connect(this.ctx.destination);

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 1.0;
    this.masterGain.connect(this.compressor);

    this.lfo = this.ctx.createOscillator();
    this.lfo.type = "sine";
    this.lfo.frequency.value = 1.2;
    this.lfoGain = this.ctx.createGain();
    this.lfoGain.gain.value = 300;
    this.lfo.connect(this.lfoGain);

    const addOsc = (freq: number, vol: number) => {
      const osc = this.ctx!.createOscillator();
      osc.type = "square";
      osc.frequency.value = freq;
      this.lfoGain!.connect(osc.frequency);
      const g = this.ctx!.createGain();
      g.gain.value = vol;
      osc.connect(g);
      g.connect(this.masterGain!);
      osc.start();
      return osc;
    };

    this.osc1 = addOsc(900,  0.6);
    this.osc2 = addOsc(1350, 0.35);
    this.lfo.start();
  }

  stop() {
    if (!this._running) return;
    this._running = false;
    [this.osc1, this.osc2, this.lfo].forEach(n => { try { n?.stop(); } catch { /* ok */ } });
    this.ctx?.close();
    this.micStream?.getTracks().forEach(t => t.stop());
    this.ctx = null; this.osc1 = null; this.osc2 = null;
    this.lfo = null; this.lfoGain = null;
    this.masterGain = null; this.compressor = null;
    this.micStream = null;
  }
}

export const sosAlarm = new SosAlarmEngine();

// ─────────────────────────────────────────────
// Emergency report overlay
// ─────────────────────────────────────────────
export function EmergencyOverlay({
  state,
  countdown,
  onCancel,
  onImmediate,
  onSosBell,
}: {
  state: EmergencyState;
  countdown: number;
  onCancel: () => void;
  onImmediate: () => void;
  onSosBell: () => void;
}) {
  if (!state) return null;
  const bgOpacity = state === "countdown" ? "rgba(0,0,0,0.75)" : "rgba(0,0,0,0.45)";

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center px-6"
      style={{ zIndex: 1800, background: bgOpacity }}
      initial={{ background: "rgba(0,0,0,0)" }}
      animate={{ background: bgOpacity }}
      transition={{ duration: 0.35 }}
    >
      {state === "countdown" && (
        <motion.div
          initial={{ scale: 0.88, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.88, opacity: 0 }}
          transition={{ type: "spring", stiffness: 340, damping: 28 }}
          className="w-full max-w-[340px] bg-white rounded-[20px] px-6 pt-6 pb-7 shadow-2xl"
        >
          <div className="text-center mb-3">
            <span style={jua} className="text-[80px] text-[#EA1E2F] leading-none">{countdown}</span>
          </div>
          <p style={jua} className="text-[#EA1E2F] text-[18px] tracking-[0.5px] text-center leading-normal mb-1">
            긴급 신고 버튼을 눌렀습니다.
          </p>
          <p style={jua} className="text-[#333] text-[14px] tracking-[0.3px] text-center leading-normal mb-6">
            취소하지 않으면 신고가 진행됩니다.
          </p>
          <div className="flex gap-3">
            <button onClick={onCancel} className="flex-1 py-3 rounded-[10px] text-white text-[16px]" style={{ ...jua, background: "#2F2F32" }}>취소</button>
            <button onClick={onImmediate} className="flex-1 py-3 rounded-[10px] text-white text-[16px]" style={{ ...jua, background: "#EA1E2F" }}>즉시 신고</button>
          </div>
        </motion.div>
      )}

      {state === "submitted" && (
        <motion.div
          initial={{ scale: 0.88, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.88, opacity: 0 }}
          transition={{ type: "spring", stiffness: 340, damping: 28 }}
          className="w-full max-w-[340px] bg-white rounded-[20px] px-6 pt-6 pb-7 shadow-2xl"
        >
          <p style={jua} className="text-[#EA1E2F] text-[20px] tracking-[0.5px] text-center leading-normal mb-3">접수되었습니다</p>
          <p style={jua} className="text-[#333] text-[13px] tracking-[0.3px] text-center leading-relaxed mb-6">
            현재 위치와 개인정보에 입력하신 정보가<br />가장 가까운 파출소로 전송되었습니다.
          </p>
          <div className="flex gap-3">
            <button onClick={onCancel} className="flex-1 py-3 rounded-[10px] text-white text-[16px]" style={{ ...jua, background: "#2F2F32" }}>취소</button>
            <button onClick={onSosBell} className="flex-1 py-3 rounded-[10px] text-white text-[16px]" style={{ ...jua, background: "#EA1E2F" }}>SOS벨</button>
          </div>
        </motion.div>
      )}

      {state === "sos-ringing" && (
        <motion.div
          initial={{ scale: 0.88, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.88, opacity: 0 }}
          transition={{ type: "spring", stiffness: 340, damping: 28 }}
          className="w-full max-w-[340px] bg-white rounded-[20px] px-6 pt-6 pb-7 shadow-2xl"
        >
          <div className="flex justify-center mb-4">
            <motion.div animate={{ rotate: [0, -18, 18, -12, 12, -6, 6, 0] }} transition={{ duration: 0.7, repeat: Infinity, repeatDelay: 0.5 }}>
              <svg width="56" height="60" viewBox="0 0 56 60" fill="none">
                <path d="M28 6C28 6 10 13 10 32V44H46V32C46 13 28 6 28 6Z" fill="#EA1E2F" />
                <rect x="22" y="1" width="12" height="6" rx="3" fill="#EA1E2F" />
                <path d="M20 44C20 48.418 23.582 52 28 52C32.418 52 36 48.418 36 44" stroke="#EA1E2F" strokeWidth="3" fill="none" strokeLinecap="round" />
              </svg>
            </motion.div>
          </div>
          <p style={jua} className="text-[#EA1E2F] text-[18px] tracking-[0.5px] text-center leading-normal mb-1">SOS 벨이 울리고 있습니다.</p>
          <p style={jua} className="text-[#555] text-[13px] tracking-[0.2px] text-center leading-normal mb-5">인근 시민에게 도움을 요청하십시오.</p>
          <div className="flex gap-3">
            <button onClick={onCancel} className="flex-1 py-3 rounded-[10px] text-white text-[15px]" style={{ ...jua, background: "#6B6B6B" }}>재생 종료</button>
            <button onClick={() => { sosAlarm.stop(); sosAlarm.start(); }} className="flex-1 py-3 rounded-[10px] text-white text-[15px]" style={{ ...jua, background: "#EA1E2F" }}>SOS벨 연속 재생</button>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// V-World 지도
// ─────────────────────────────────────────────
function escapeMarkerLabel(label: string) {
  return label.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}
export function VWorldMap({
  markers = [],
  focus,
}: {
  markers?: { lat: number; lng: number; label: string }[];
  focus?: { lat: number; lng: number } | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [37.5665, 126.9780],
      zoom: 17,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer(
      `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Base/{z}/{y}/{x}.png`,
      { maxZoom: 19 }
    ).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    markersLayerRef.current = layerGroup;

    mapRef.current = map;
    const sizeTimer = setTimeout(() => { if (mapRef.current) map.invalidateSize(); }, 100);

    if (navigator.geolocation && markers.length === 0) {
      navigator.geolocation.getCurrentPosition(
        pos => { mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 17, { animate: true }); },
        () => {}
      );
    }

    return () => {
      clearTimeout(sizeTimer);
      try { map.stop(); } catch {}
      try { map.remove(); } catch {}
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!markersLayerRef.current || !mapRef.current) return;
    markersLayerRef.current.clearLayers();

    if (markers.length > 0) {
      const bounds = L.latLngBounds([]);
      markers.forEach(m => {
        const pawIcon = L.divIcon({
          className: "zipro-favorite-paw-marker",
          html: `<div style="width:112px; display:flex; flex-direction:column; align-items:center; text-align:center; pointer-events:none;">
                   <img src="${FAVORITE_PAW_ICON}" alt="" style="width:43px; height:51px; object-fit:contain; display:block;" />
                   <span style="margin-top:-2px; font-family:'Jua',sans-serif; font-size:13px; line-height:18px; font-weight:700; color:#16100b; white-space:nowrap; text-shadow:0 1px 2px rgba(255,255,255,0.95);">${escapeMarkerLabel(m.label)}</span>
                 </div>`,
          iconSize: [112, 72],
          iconAnchor: [56, 72],
        });
        const marker = L.marker([m.lat, m.lng], { icon: pawIcon });
        markersLayerRef.current?.addLayer(marker);
        bounds.extend([m.lat, m.lng]);
      });
      if (markers.length === 1) {
        mapRef.current.setView(markers[0], 17);
      } else if (markers.length > 1) {
        mapRef.current.fitBounds(bounds, { padding: [50, 50] });
      }
    }
  }, [markers]);

  // 내 장소 목록에서 특정 장소를 선택하면 해당 곰발바닥 마커가 보이도록 지도를 이동한다.
  useEffect(() => {
    if (!focus || !mapRef.current) return;
    mapRef.current.setView([focus.lat, focus.lng], 17, { animate: true });
  }, [focus?.lat, focus?.lng]);

  return <div ref={containerRef} className="absolute inset-0" />;
}

// ─────────────────────────────────────────────
// Menu overlay (Restored to original, removed favorite place button)
// ─────────────────────────────────────────────
const HELP_CONTACTS: { role: string; emails: string[] }[] = [
  { role: "관리 팀장",      emails: ["smily_price@naver.com"] },
  { role: "서버 오류 문의", emails: ["20261114@naver.com", "leesubin1129@naver.com"] },
  { role: "화면 오류 문의", emails: ["nalin01@naver.com"] },
];

export function MenuOverlay({
  onClose,
  onLogout,
  onNavigate,
}: {
  onClose: () => void;
  onLogout: () => void;
  onNavigate: (s: Screen) => void;
}) {
  const menuButtons: { label: string; bg: string; screen?: Screen }[] = [
    { label: "커뮤니티", bg: "#96530f", screen: "커뮤니티" },
    { label: "보안화면", bg: "#80460d", screen: "보안화면" },
    { label: "모니터링", bg: "#b25e09", screen: "모니터링" },
    { label: "개인정보", bg: "#96530f", screen: "개인정보" },
    { label: "설정",     bg: "#80460d", screen: "설정" },
  ];
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0" onClick={onClose} />
      <motion.div
        className="absolute top-0 right-0 h-full w-[225px] flex flex-col"
        initial={{ x: 225 }} animate={{ x: 0 }} exit={{ x: 225 }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
      >
        <div className="absolute inset-0 bg-[#ffeba2] border-l border-[#f5e092]" />
        <button onClick={onClose} className="absolute top-[25px] right-[20px] w-8 h-8 flex items-center justify-center rounded-full transition-opacity active:opacity-60 z-10" style={{ background: "rgba(0,0,0,0.12)" }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M1 1l11 11M12 1L1 12" stroke="#333" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        <div className="relative z-10 mt-[74px] ml-2 shrink-0">
          <ZipRoLogo imgSrc={imgMenuLogo} width={200} />
        </div>

        <div className="relative z-10 flex flex-col gap-[14px] items-start px-[26px] mt-[16px] flex-1 overflow-y-auto">
          {menuButtons.map(({ label, bg, screen }) => (
            <button key={label} className="h-[55px] rounded-[8px] w-[158px] flex items-center justify-center border border-[#684537] shrink-0"
              style={{ background: bg }}
              onClick={() => { if (screen) { onClose(); onNavigate(screen); } }}>
              <p style={jua} className="text-[15px] text-white tracking-[0.75px] leading-[normal]">{label}</p>
            </button>
          ))}

          <button onClick={() => setShowHelp(true)} style={jua} className="text-[15px] text-black text-center tracking-[0.75px] w-[158px] mt-4 cursor-pointer hover:opacity-70 transition-opacity">도움말</button>
          <button onClick={() => { onClose(); onLogout(); }} style={jua} className="text-[15px] text-black text-center tracking-[0.75px] w-[158px] cursor-pointer hover:opacity-70 transition-opacity">로그아웃</button>
        </div>

        <div className="relative z-10 w-[51px] h-[87px] ml-[14px] mb-[24px] shrink-0">
          <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgMenuProfile} />
        </div>
      </motion.div>

      <AnimatePresence>
        {showHelp && (
          <motion.div
            key="help-modal"
            className="absolute inset-0 flex items-center justify-center px-6"
            style={{ zIndex: 2000, background: "rgba(0,0,0,0.45)" }}
            initial={{ background: "rgba(0,0,0,0)" }} animate={{ background: "rgba(0,0,0,0.45)" }} exit={{ background: "rgba(0,0,0,0)" }}
            onClick={() => setShowHelp(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 340, damping: 28 }}
              className="relative w-full max-w-[320px] rounded-[20px] px-6 pt-6 pb-6 shadow-2xl bg-[#F9F1DE]"
              onClick={e => e.stopPropagation()}
            >
              <button onClick={() => setShowHelp(false)} className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full" style={{ background: "rgba(0,0,0,0.08)" }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M1 1l10 10M11 1L1 11" stroke="#333" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
              <p style={jua} className="text-[#222] text-[18px] tracking-[0.5px] text-center leading-normal mb-4 mt-1">담당자 안내</p>
              <div className="flex flex-col gap-3 mb-6">
                {HELP_CONTACTS.map(({ role, emails }) => (
                  <div key={role} className="flex flex-col gap-0.5">
                    <p style={jua} className="text-[13px] text-[#96530f] tracking-[0.3px]">{role}</p>
                    {emails.map(email => (
                      <p key={email} className="text-[13px] text-[#333]" style={{ fontFamily: "system-ui, sans-serif" }}>{email}</p>
                    ))}
                  </div>
                ))}
              </div>
              <button onClick={() => setShowHelp(false)} className="w-full py-3 rounded-[10px] text-white text-[15px]" style={{ ...jua, background: "#b25e09" }}>확인</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────
// Favorite Places Map & List Screen Component
// ─────────────────────────────────────────────
function FavoriteMapScreen({
  favorites,
  onBack,
  onAddFavorite,
  onDeleteFavorite,
  onUpdateFavorite,
}: {
  favorites: FavoritePlace[];
  onBack: () => void;
  onAddFavorite: (place: FavoritePlace) => void;
  onDeleteFavorite: (id: string) => void;
  onUpdateFavorite: (place: FavoritePlace) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<NavPlace[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [focusedFavoriteId, setFocusedFavoriteId] = useState<string | null>(null);

  // ★ 변경 3 — 패널 드래그 자유 조절 (이전: min/mid/max 단계 토글)
  const [panelHeight, setPanelHeight] = useState(320);
  const dragRef = useRef<{ startY: number; startHeight: number; pointerId: number } | null>(null);
  const MIN_PANEL_H = 180;
  const maxPanelH = () =>
    typeof window === "undefined"
      ? 600
      : Math.max(window.innerHeight - 120, MIN_PANEL_H + 40);

  const handlePanelDragStart = (e: React.PointerEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startHeight: panelHeight, pointerId: e.pointerId };
    try { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); } catch {}
  };
  const handlePanelDragMove = (e: React.PointerEvent) => {
    if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) return;
    const delta = dragRef.current.startY - e.clientY; // 위 = +
    const next = Math.max(
      MIN_PANEL_H,
      Math.min(maxPanelH(), dragRef.current.startHeight + delta),
    );
    setPanelHeight(next);
  };
  const handlePanelDragEnd = (e: React.PointerEvent) => {
    if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) return;
    dragRef.current = null;
    try { (e.target as HTMLElement).releasePointerCapture?.(e.pointerId); } catch {}
  };

  // ★ 변경 4 — 수정 모달: 검색 vs 직접 입력
  const [editingPlace, setEditingPlace] = useState<FavoritePlace | null>(null);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editCoordinates, setEditCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  // 주소는 직접 입력 대신 SearchOverlay 로 선택
  const [isEditingAddress, setIsEditingAddress] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (query.length < 2) return;

    setIsSearching(true);
    try {
      const results = await searchFavoritePlaces(query);
      setSearchResults(results);
    } finally {
      setIsSearching(false);
    }
  };

  // 출발지·도착지 검색과 마찬가지로 입력 중인 키워드에 맞춰 연관 장소를 자동 표시한다.
  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setIsSearching(true);
      const results = await searchFavoritePlaces(query);
      if (cancelled) return;
      setSearchResults(results);
      setIsSearching(false);
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchQuery]);

  const markers = favorites.map(f => ({ lat: f.lat, lng: f.lng, label: f.name }));
  const focusedFavorite = favorites.find((place) => place.id === focusedFavoriteId) ?? null;

  return (
    <div className="absolute inset-0 bg-[#fff3c5] overflow-hidden" style={{ zIndex: 2500 }}>
      <div className="absolute inset-0" style={{ zIndex: 0 }}>
        <VWorldMap markers={markers} focus={focusedFavorite} />
      </div>

      {/* 메인 지도 상단 도구 영역과 같은 세로 위치로 정렬 */}
      <div className="absolute top-[60px] left-4 right-4 flex items-center gap-2 pointer-events-auto" style={{ zIndex: 10 }}>
        <button
          onClick={() => setMenuOpen(true)}
          className="w-11 h-11 bg-white rounded-xl shadow-md flex items-center justify-center shrink-0 active:scale-95"
        >
          <svg width="22" height="16" viewBox="0 0 30 21" fill="none">
            <path d={mainPaths.p200c3d80} stroke="#1E1E1E" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
          </svg>
        </button>

        <form onSubmit={handleSearch} className="flex-1 flex items-center bg-white rounded-xl shadow-md px-3 h-11 gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="8" stroke="#666" strokeWidth="2" />
            <path d="M21 21l-4.35-4.35" stroke="#666" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="장소 검색 (예: 회현역, 서울타워)"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="flex-1 text-sm bg-transparent outline-none text-[#333]"
            style={jua}
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery("")} className="text-gray-400 text-xs">✕</button>
          )}
        </form>

        <button
          onClick={onBack}
          className="w-11 h-11 bg-white rounded-xl shadow-md flex items-center justify-center shrink-0 active:scale-95"
          title="메인으로 복귀"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M9 18l6-6-6-6" stroke="#333" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {(searchQuery.trim().length >= 2) && (
        <div className="absolute top-[112px] left-4 right-4 overflow-hidden rounded-xl shadow-xl border border-[#eadba9] bg-[#fff3c5]" style={{ zIndex: 20 }}>
          <div className="flex justify-between items-center px-3 py-2 border-b border-[#eadba9] bg-[#fff8df]">
            <span style={jua} className="text-xs text-[#8a6420]">
              {isSearching ? "연관 장소를 찾는 중…" : "연관 장소"}
            </span>
            <button
              onClick={() => { setSearchQuery(""); setSearchResults([]); }}
              className="text-xs text-[#8a6420] px-1"
              style={jua}
            >
              닫기
            </button>
          </div>

          <div className="max-h-[300px] overflow-y-auto">
            {!isSearching && searchResults.length === 0 ? (
              <p style={jua} className="px-4 py-5 text-center text-sm text-[#9b875e]">
                검색 결과가 없습니다.
              </p>
            ) : (
              searchResults.map((res, idx) => {
                const isFav = favorites.some(f =>
                  f.name === res.name && Math.abs(f.lat - res.lat) < 0.00001 && Math.abs(f.lng - res.lng) < 0.00001
                );
                return (
                  <div key={`${res.name}-${res.lat}-${res.lng}`} className="flex items-center gap-2 px-3 py-3 border-b border-[#eadba9] last:border-b-0 bg-[#fff3c5]">
                    <div className="w-8 h-8 rounded-lg bg-[#b25e09] text-white flex items-center justify-center shrink-0 text-[15px]">🐾</div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span style={jua} className="text-sm text-[#3d2a10] truncate">{res.name}</span>
                      <span style={{ fontFamily: "system-ui" }} className="text-xs text-[#826f48] truncate">{res.address}</span>
                    </div>
                    <button
                      onClick={() => {
                        if (!isFav) {
                          onAddFavorite({
                            id: `${Date.now()}-${idx}`,
                            name: res.name,
                            address: res.address,
                            lat: res.lat,
                            lng: res.lng,
                          });
                        }
                      }}
                      className={`shrink-0 w-9 h-9 rounded-full text-[17px] transition-transform ${isFav ? "bg-amber-100 text-amber-700" : "bg-white text-[#b25e09] shadow-sm active:scale-90"}`}
                      title={isFav ? "이미 즐겨찾기에 추가됨" : "즐겨찾기에 추가"}
                      aria-label={isFav ? "이미 즐겨찾기에 추가됨" : `${res.name} 즐겨찾기에 추가`}
                    >
                      {isFav ? "★" : "☆"}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[24px] shadow-2xl flex flex-col"
            style={{ zIndex: 30, height: `${panelHeight}px` }}
          >
            {/*
              ★ 변경 3 — 드래그 핸들: 위 = +, 아래 = -. PC/모바일 모두 PointerEvent.
              click 단계 토글 동작은 제거했어요. 이제 이 배너는 잡고 끌어당기는 역할만 남았어요.
            */}
            <div
              className="w-full py-3 flex items-center justify-center cursor-grab select-none touch-none"
              title="위·아래로 드래그해 크기 조절"
              onPointerDown={handlePanelDragStart}
              onPointerMove={handlePanelDragMove}
              onPointerUp={handlePanelDragEnd}
              onPointerCancel={handlePanelDragEnd}
            >
              <div className="w-10 h-1.5 bg-gray-300 rounded-full" />
            </div>

            <div className="px-5 pb-2 flex items-center justify-between border-b border-gray-100">
              <h3 style={jua} className="text-lg text-[#333]">내 즐겨찾기 장소 목록 ({favorites.length})</h3>
              <button onClick={() => setMenuOpen(false)} className="text-xs text-gray-500 py-1 px-2 rounded bg-gray-100" style={jua}>닫기</button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3 flex flex-col gap-2.5">
              {favorites.length === 0 ? (
                <div className="py-8 text-center">
                  <p style={jua} className="text-sm text-gray-400">등록된 즐겨찾기 장소가 없습니다.</p>
                  <p style={jua} className="text-xs text-gray-300 mt-1">상단 검색창에서 장소를 검색해 별표를 눌러보세요!</p>
                </div>
              ) : (
                favorites.map(fav => (
                  <div
                    key={fav.id}
                    onClick={() => {
                      // 지도만 선택 장소로 이동하고, 사용자가 열어 둔 내 장소 목록 패널은 그대로 유지한다.
                      setFocusedFavoriteId(fav.id);
                    }}
                    className="flex items-center justify-between p-3 rounded-xl bg-[#fffcf5] border border-amber-200 shadow-sm cursor-pointer active:bg-amber-50"
                    title="눌러서 지도에서 위치 보기"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditingPlace(fav);
                          setEditName(fav.name);
                          setEditAddress(fav.address);
                          setEditCoordinates({ lat: fav.lat, lng: fav.lng });
                          setIsEditingAddress(false);
                        }}
                        className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0 hover:bg-amber-100 active:scale-95"
                        title="상세 수정"
                      >
                        ✏️
                      </button>
                      <div className="flex flex-col min-w-0 flex-1">
                        <span style={jua} className="text-sm text-[#222] truncate">{fav.name}</span>
                        <span style={{ fontFamily: "system-ui" }} className="text-xs text-gray-500 truncate">{fav.address}</span>
                      </div>
                    </div>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteFavorite(fav.id);
                      }}
                      className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0 hover:bg-red-100 active:scale-95 ml-2"
                      title="삭제"
                    >
                      🗑️
                    </button>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ★ 변경 4 — 주소 검색 모드 (수정 모달 위 전체 화면 SearchOverlay 로 진입) */}
      <AnimatePresence>
        {editingPlace && isEditingAddress && (
          <motion.div
            key="edit-address-search"
            className="absolute inset-0"
            style={{ zIndex: 2600 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <SearchOverlay
              mode="dest"
              initial={editAddress}
              onConfirm={p => {
                setEditAddress(p.address);
                setEditCoordinates({ lat: p.lat, lng: p.lng });
                setIsEditingAddress(false);
              }}
              onBack={() => setIsEditingAddress(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ★ 변경 4 — 수정 모달: 주소는 readOnly + "🔎 주소 검색" 버튼 */}
      <AnimatePresence>
        {editingPlace && !isEditingAddress && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute inset-0 flex items-center justify-center p-5"
            style={{ zIndex: 40, background: "rgba(0,0,0,0.5)" }}
          >
            <div className="w-full max-w-[340px] bg-white rounded-[20px] p-6 shadow-2xl">
              <h3 style={jua} className="text-lg text-[#333] mb-4 text-center">장소 정보 수정</h3>

              <div className="flex flex-col gap-3 mb-5">
                <div>
                  <label style={jua} className="text-xs text-gray-500 mb-1 block">장소명</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#b25e09]"
                    style={{ ...jua, color: "#333" }}
                  />
                </div>

                <div>
                  <label style={jua} className="text-xs text-gray-500 mb-1 block">주소</label>
                  <div className="flex items-stretch gap-2">
                    <input
                      type="text"
                      value={editAddress}
                      readOnly
                      placeholder="🔎 주소 검색 버튼을 눌러 선택하세요"
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#b25e09] bg-gray-50"
                      style={{ fontFamily: "system-ui, sans-serif", color: "#333" }}
                    />
                    <button
                      onClick={() => setIsEditingAddress(true)}
                      className="px-3 py-2.5 rounded-xl bg-[#b25e09] text-white text-xs shrink-0 active:scale-95"
                      style={jua}
                      title="주소 검색"
                    >
                      🔎 주소 검색
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => { setEditingPlace(null); setEditCoordinates(null); setIsEditingAddress(false); }}
                  className="flex-1 py-3 rounded-xl bg-gray-200 text-[#333] text-sm"
                  style={jua}
                >
                  취소
                </button>
                <button
                  onClick={() => {
                    const name = editName.trim() || editingPlace.name;
                    onUpdateFavorite({
                      ...editingPlace,
                      name,
                      address: editAddress,
                      lat: editCoordinates?.lat ?? editingPlace.lat,
                      lng: editCoordinates?.lng ?? editingPlace.lng,
                    });
                    setEditingPlace(null);
                    setEditCoordinates(null);
                    setIsEditingAddress(false);
                  }}
                  className="flex-1 py-3 rounded-xl bg-[#b25e09] text-white text-sm"
                  style={jua}
                >
                  저장
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────
export function MainScreen({
  onLogout,
  onNavigate,
  autoStart,
  onAutoStarted,
  initialNavMode, // ★ 변경 1 — 외부 라우터에서 즐겨찾기 화면 진입용 (예: "favorite-map")
}: {
  onLogout: () => void;
  onNavigate: (s: Screen) => void;
  autoStart?: boolean;
  onAutoStarted?: () => void;
  initialNavMode?: MainNavMode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [emergency, setEmergency] = useState<EmergencyState>(null);
  const [countdown, setCountdown] = useState(5);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const BOTTOM_H = 91;
  const SOS_SIZE = 121;

  // 외부 라우터에서 initialNavMode가 들어오면 즐겨찾기 지도 모드로 바로 진입한다.
  const [navMode, setNavMode]      = useState<MainNavMode>(initialNavMode ?? "idle");
  const [origin, setOrigin]        = useState<NavPlace | null>(null);
  const [dest, setDest]            = useState<NavPlace | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<SafeRoute | null>(null);
  const [travelMode, setTravelMode] = useState<"walk" | "drive">("walk");

  // 즐겨찾기는 로그인한 계정별 키에 저장한다.
  const favoritesStorageKey = getFavoritesStorageKey();
  const [favorites, setFavorites] = useState<FavoritePlace[]>(() => loadAccountFavorites(favoritesStorageKey));

  useEffect(() => {
    try {
      localStorage.setItem(favoritesStorageKey, JSON.stringify(favorites));
    } catch {}
  }, [favorites, favoritesStorageKey]);

  function handleLocBtn() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          setOrigin({
            name: "현재 위치",
            address: `(${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        },
        () => {
          setOrigin({ name: "현재 위치", address: "서울특별시 중구 퇴계로", lat: 37.5559, lng: 126.9792 });
        }
      );
    } else {
      setOrigin({ name: "현재 위치", address: "서울특별시 중구 퇴계로", lat: 37.5559, lng: 126.9792 });
    }
  }

  function startEmergency() {
    setCountdown(5);
    setEmergency("countdown");
    let n = 5;
    countdownRef.current = setInterval(() => {
      n -= 1;
      setCountdown(n);
      if (n <= 0) {
        clearInterval(countdownRef.current!);
        setEmergency("submitted");
        navigator.geolocation.getCurrentPosition(
          (pos) => { emergencyApi.siren(pos.coords.latitude, pos.coords.longitude).catch(() => {}); },
          () => { emergencyApi.siren(37.5665, 126.9780).catch(() => {}); },
          { timeout: 5000, maximumAge: 30000 }
        );
      }
    }, 1000);
  }

  function cancelEmergency() {
    if (countdownRef.current) clearInterval(countdownRef.current!);
    sosAlarm.stop();
    setEmergency(null);
    setCountdown(5);
  }

  function immediateReport() {
    if (countdownRef.current) clearInterval(countdownRef.current!);
    setEmergency("submitted");
    navigator.geolocation.getCurrentPosition(
      (pos) => { emergencyApi.siren(pos.coords.latitude, pos.coords.longitude).catch(() => {}); },
      () => { emergencyApi.siren(37.5665, 126.9780).catch(() => {}); },
      { timeout: 5000, maximumAge: 30000 }
    );
  }

  function activateSosBell() {
    sosAlarm.start();
    setEmergency("sos-ringing");
  }

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current!);
      sosAlarm.stop();
    };
  }, []);

  useEffect(() => {
    if (autoStart) {
      startEmergency();
      onAutoStarted?.();
    }
  }, [autoStart]);

  useEffect(() => {
    (async () => {
      try {
        const token = await requestFcmToken();
        if (token) await fcmApi.registerToken(token);
      } catch {}
    })();
  }, []);

  // ★ 라우팅 폴백 — 외부 라우터가 initialNavMode 를 넘기지 못할 때
  // (예: 설정 화면의 "즐겨찾는 장소" 버튼이 직접 onNavigate 만 호출하고
  // MainScreen 마운트 시점의 초기 props 가 항상 "idle" 인 구조일 경우)
  // 설정/라우터 쪽에서 window.dispatchEvent(new Event("zipro:openFavoriteMap"))
  // 만 던져도 FavoriteMapScreen 으로 진입할 수 있게 합니다.
  // (Settings 화면 코드 자체는 건드리지 않는다는 약속을 지키기 위한 안전장치입니다.)
  useEffect(() => {
    const openFavorite = () => setNavMode("favorite-map");
    window.addEventListener("zipro:openFavoriteMap", openFavorite);
    return () => window.removeEventListener("zipro:openFavoriteMap", openFavorite);
  }, []);

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#fff3c5]">

      <div className="absolute inset-0" style={{ zIndex: 0, isolation: "isolate" }}>
        <VWorldMap />
      </div>

      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1000 }}>
        {navMode !== "navigating" && (
          <button onClick={() => setMenuOpen(true)} className="absolute top-[60px] left-[7px] flex items-center justify-center h-[51px] w-[45px] pointer-events-auto">
            <svg width="30" height="21" viewBox="0 0 30 21" fill="none">
              <path d={mainPaths.p200c3d80} stroke="#1E1E1E" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
            </svg>
          </button>
        )}

        {navMode !== "navigating" && (
          <div className="absolute top-[60px] flex items-center gap-2 pointer-events-auto" style={{ left: 55, right: 55 }}>
            <div className="flex-1 bg-white rounded-[12px] overflow-hidden shadow-[0_2px_10px_rgba(0,0,0,0.18)]">
              <div
                role="button" tabIndex={0}
                className="w-full flex items-center px-3 gap-2 cursor-pointer active:bg-gray-50 transition-colors"
                style={{ height: 44, borderBottom: "1px solid #f0f0f0" }}
                onClick={() => setNavMode("search-origin")}
              >
                <div className="shrink-0 w-2.5 h-2.5 rounded-full bg-green-600" />
                <span style={{ ...jua, fontSize: 12, color: "#999", minWidth: 32 }}>출발지</span>
                <span className="flex-1 min-w-0 text-left truncate" style={{ ...jua, fontSize: 13, color: origin ? "#1a1a1a" : "#c0c0c0" }}>
                  {origin?.name || "출발지를 검색하세요"}
                </span>

                <div
                  role="button" tabIndex={0}
                  onMouseDown={e => { e.stopPropagation(); e.preventDefault(); handleLocBtn(); }}
                  onClick={e => e.stopPropagation()}
                  className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full cursor-pointer hover:bg-gray-100"
                  title="현재 위치 출발지 입력"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="3" fill="#b25e09" />
                    <circle cx="12" cy="12" r="7" stroke="#b25e09" strokeWidth="2" />
                    <path d="M12 2V5M12 19V22M2 12H5M19 12H22" stroke="#b25e09" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
                {origin && (
                  <div role="button" tabIndex={0} onMouseDown={e => { e.stopPropagation(); e.preventDefault(); setOrigin(null); }} onClick={e => e.stopPropagation()} className="shrink-0 w-6 h-6 flex items-center justify-center cursor-pointer">
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                      <path d="M1 1l12 12M13 1L1 13" stroke="#aaa" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </div>
                )}
              </div>

              <div
                role="button" tabIndex={0}
                className="w-full flex items-center px-3 gap-2 cursor-pointer active:bg-gray-50 transition-colors"
                style={{ height: 44 }}
                onClick={() => setNavMode("search-dest")}
              >
                <div className="shrink-0 w-2.5 h-2.5 rounded-full bg-red-500" />
                <span style={{ ...jua, fontSize: 12, color: "#999", minWidth: 32 }}>도착지</span>
                <span className="flex-1 min-w-0 text-left truncate" style={{ ...jua, fontSize: 13, color: dest ? "#1a1a1a" : "#c0c0c0" }}>
                  {dest?.name || "도착지를 검색하세요"}
                </span>

                <div
                  role="button" tabIndex={0}
                  onMouseDown={e => { e.stopPropagation(); e.preventDefault(); setNavMode("dest-favorite-picker"); }}
                  onClick={e => e.stopPropagation()}
                  className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full cursor-pointer hover:bg-amber-50"
                  title="즐겨찾기한 장소에서 도착지 선택"
                >
                  <span style={{ fontSize: 16 }}>⭐</span>
                </div>

                {dest && (
                  <div role="button" tabIndex={0} onMouseDown={e => { e.stopPropagation(); e.preventDefault(); setDest(null); }} onClick={e => e.stopPropagation()} className="shrink-0 w-6 h-6 flex items-center justify-center cursor-pointer">
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                      <path d="M1 1l12 12M13 1L1 13" stroke="#aaa" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {origin && dest && (navMode === "idle") && (
          <div className="absolute pointer-events-auto" style={{ top: 166, left: 55, zIndex: 15 }}>
            <button
              onClick={() => setNavMode("route-results")}
              className="flex flex-col items-center justify-center active:scale-95 transition-all"
              style={{ width: 52, height: 52, borderRadius: 14, background: "linear-gradient(135deg,#2e7d32 0%,#43a047 100%)", boxShadow: "0 3px 12px rgba(46,125,50,0.45)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M3 12h18M13 6l6 6-6 6" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span style={{ ...jua, fontSize: 9, color: "white", marginTop: 2 }}>경로찾기</span>
            </button>
          </div>
        )}

        {navMode !== "navigating" && (
          <button onClick={onLogout} className="absolute top-[60px] right-[7px] flex items-center justify-center h-[51px] w-[45px] pointer-events-auto">
            <svg width="26" height="30" viewBox="0 0 33 39" fill="none">
              <path d={mainPaths.pf750080} stroke="#1E1E1E" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
            </svg>
          </button>
        )}

        <div className="absolute bottom-0 left-0 right-0 bg-[#fff3c5] rounded-tl-[20px] rounded-tr-[20px] shadow-[0px_0px_7px_0px_rgba(0,0,0,0.5)] pointer-events-auto" style={{ height: BOTTOM_H }} />

        <div className="absolute left-1/2 -translate-x-1/2 pointer-events-auto cursor-pointer" onClick={startEmergency} style={{ width: SOS_SIZE, height: SOS_SIZE, bottom: BOTTOM_H - SOS_SIZE / 2 }}>
          <div className="absolute" style={{ inset: "-6px" }}>
            <svg className="block size-full" fill="none" viewBox="0 0 133 133">
              <g filter="url(#filter0_d_main)">
                <circle cx="66.5" cy="66.5" fill="#EA1E2F" r="60.5" />
              </g>
              <defs>
                <filter colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" height="133" id="filter0_d_main" width="133" x="0" y="0">
                  <feFlood floodOpacity="0" result="BackgroundImageFix" />
                  <feColorMatrix in="SourceAlpha" result="hardAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" />
                  <feMorphology in="SourceAlpha" operator="dilate" radius="1" result="effect1_dropShadow_main" />
                  <feOffset /><feGaussianBlur stdDeviation="2.5" />
                  <feComposite in2="hardAlpha" operator="out" />
                  <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0" />
                  <feBlend in2="BackgroundImageFix" mode="normal" result="effect1_dropShadow_main" />
                  <feBlend in="SourceGraphic" in2="effect1_dropShadow_main" mode="normal" result="shape" />
                </filter>
              </defs>
            </svg>
          </div>
          <div className="absolute" style={{ inset: "10px" }}>
            <svg className="absolute block inset-0 size-full" fill="none" viewBox="0 0 101 101">
              <circle cx="50.5" cy="50.5" fill="white" r="50.5" />
            </svg>
          </div>
          <div className="absolute flex items-center justify-center" style={{ inset: "20px" }}>
            <svg className="block size-full" fill="none" viewBox="0 0 67 56.3321">
              <path d={mainPaths.p3b87de80} stroke="#EA1E2F" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
              <path d={mainPaths.p3bc54280} stroke="#EA1E2F" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
              <path d="M61.4 28.1677H64.5" stroke="#EA1E2F" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
              <path d={mainPaths.p4f40c8} stroke="#EA1E2F" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
              <path d="M2.5 28.1677H5.60001" stroke="#EA1E2F" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
              <path d="M33.502 2.5V5.06662" stroke="#EA1E2F" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
              <path d={mainPaths.pb33540} stroke="#EA1E2F" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
              <path d="M33.502 28.1677V43.5674" stroke="#EA1E2F" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
            </svg>
          </div>
        </div>

        <p style={{ ...jua, bottom: 5 }} className="absolute left-1/2 -translate-x-1/2 text-[15px] text-black text-center tracking-[0.75px] whitespace-nowrap">긴급신고</p>

        <div className="absolute flex flex-col items-center gap-1 pointer-events-auto cursor-pointer" onClick={() => onNavigate("보안화면")} style={{ left: "14.5%", transform: "translateX(-50%)", bottom: 8 }}>
          <div style={{ width: 33, height: 40, position: "relative" }}>
            <div className="absolute" style={{ inset: "-5%" }}>
              <svg className="block size-full" fill="none" viewBox="0 0 33 40">
                <path d={mainPaths.p2b76700} stroke="#1D2433" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
              </svg>
            </div>
          </div>
          <p style={jua} className="text-[15px] text-black text-center tracking-[0.75px] whitespace-nowrap">보안화면</p>
        </div>

        <div className="absolute flex flex-col items-center gap-1 pointer-events-auto cursor-pointer" onClick={() => onNavigate("커뮤니티")} style={{ right: "14.5%", transform: "translateX(50%)", bottom: 8 }}>
          <div style={{ width: 40, height: 40, position: "relative" }}>
            <svg className="absolute block inset-0 size-full" fill="none" viewBox="0 0 40 40">
              <path d={mainPaths.p313e2cc0} stroke="black" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
              <path d={mainPaths.pa1ce23e} stroke="black" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
            </svg>
          </div>
          <p style={jua} className="text-[15px] text-black text-center tracking-[0.75px] whitespace-nowrap">커뮤니티</p>
        </div>
      </div>

      <AnimatePresence>
        {navMode === "search-origin" && (
          <motion.div key="search-origin" className="absolute inset-0" style={{ zIndex: 2000 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            <SearchOverlay mode="origin" initial={origin?.name ?? ""} onConfirm={p => { setOrigin(p); setNavMode("search-dest"); }} onBack={() => setNavMode("idle")} />
          </motion.div>
        )}
        {navMode === "search-dest" && (
          <motion.div key="search-dest" className="absolute inset-0" style={{ zIndex: 2000 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            <SearchOverlay mode="dest" initial={dest?.name ?? ""} onConfirm={p => { setDest(p); if (origin) { setNavMode("route-results"); } else { setNavMode("idle"); } }} onBack={() => setNavMode("idle")} />
          </motion.div>
        )}
        {navMode === "route-results" && origin && dest && (
          <motion.div key="route-results" className="absolute inset-0" style={{ zIndex: 2000 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            <RouteResultsSheet origin={origin} dest={dest} onSelectRoute={(r, mode) => { setSelectedRoute(r); setTravelMode(mode); setNavMode("navigating"); }} onBack={() => setNavMode("idle")} />
          </motion.div>
        )}
        {navMode === "navigating" && origin && dest && selectedRoute && (
          <motion.div key="navigating" className="absolute inset-0" style={{ zIndex: 2000 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            <NavigationView route={selectedRoute} origin={origin} dest={dest} onEnd={() => { setNavMode("idle"); setSelectedRoute(null); setOrigin(null); setDest(null); }} onBackToRoutes={() => { setNavMode("route-results"); setSelectedRoute(null); }} onEmergency={startEmergency} onNavigate={onNavigate} travelMode={travelMode} />
          </motion.div>
        )}

        {/* Favorite Map Screen Mode (Triggered from Settings screen or via initialNavMode) */}
        {navMode === "favorite-map" && (
          <FavoriteMapScreen
            favorites={favorites}
            // ★ 변경 2 — 백 아이콘이 메인 지도 모드로 바로 복귀
            // 동시에 라우터/설정 화면이 동기화할 수 있도록 "즐겨찾기 닫힘" 신호를 흘립니다.
            onBack={() => onNavigate("main")}
            onAddFavorite={newPlace => setFavorites(prev => {
              const exists = prev.some(place =>
                place.name === newPlace.name &&
                Math.abs(place.lat - newPlace.lat) < 0.00001 &&
                Math.abs(place.lng - newPlace.lng) < 0.00001
              );
              return exists ? prev : [...prev, newPlace];
            })}
            onDeleteFavorite={id => setFavorites(prev => prev.filter(f => f.id !== id))}
            onUpdateFavorite={updated => setFavorites(prev => prev.map(f => f.id === updated.id ? updated : f))}
          />
        )}

        {navMode === "dest-favorite-picker" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex items-center justify-center p-5" style={{ zIndex: 2500, background: "rgba(0,0,0,0.5)" }}>
            <div className="w-full max-w-[340px] bg-white rounded-[20px] p-5 shadow-2xl max-h-[420px] flex flex-col">
              <div className="flex justify-between items-center mb-3">
                <h3 style={jua} className="text-lg text-[#333]">즐겨찾기 장소에서 선택</h3>
                <button onClick={() => setNavMode("idle")} className="text-xs text-gray-500 py-1 px-2 rounded bg-gray-100" style={jua}>닫기</button>
              </div>
              <div className="flex-1 overflow-y-auto flex flex-col gap-2">
                {favorites.length === 0 ? (
                  <p style={jua} className="text-center text-sm text-gray-400 py-8">저장된 즐겨찾기 장소가 없습니다.</p>
                ) : (
                  favorites.map(fav => (
                    <div
                      key={fav.id}
                      onClick={() => {
                        setDest({ name: fav.name, address: fav.address, lat: fav.lat, lng: fav.lng });
                        if (origin) setNavMode("route-results");
                        else setNavMode("idle");
                      }}
                      className="p-3 rounded-xl bg-gray-50 hover:bg-amber-50 cursor-pointer border border-gray-100 flex flex-col"
                    >
                      <span style={jua} className="text-sm text-[#222]">{fav.name}</span>
                      <span style={{ fontFamily: "system-ui" }} className="text-xs text-gray-500 truncate">{fav.address}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ position: "absolute", inset: 0, zIndex: 1500, pointerEvents: menuOpen ? "auto" : "none" }}>
        <AnimatePresence>
          {menuOpen && (
            <MenuOverlay
              key="menu"
              onClose={() => setMenuOpen(false)}
              onLogout={onLogout}
              onNavigate={onNavigate}
            />
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {emergency && (
          <EmergencyOverlay
            key="emergency"
            state={emergency}
            countdown={countdown}
            onCancel={cancelEmergency}
            onImmediate={immediateReport}
            onSosBell={activateSosBell}
          />
        )}
      </AnimatePresence>
    </div>
  );
}



