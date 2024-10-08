// @ts-nocheck
/* eslint-disable */
/* tslint:disable */
/* prettier-ignore-start */
import React from "react";
import { classNames } from "@plasmicapp/react-web";

export function ObsIcon(props) {
  const { className, style, title, ...restProps } = props;
  return (
    <svg
      xmlns={"http://www.w3.org/2000/svg"}
      viewBox={"-11.261 -18.767 97.591 112.605"}
      height={"1em"}
      className={classNames("plasmic-default__svg", className)}
      style={style}
      {...restProps}
    >
      {title && <title>{title}</title>}

      <circle
        strokeWidth={"3.47"}
        stroke={"#fff"}
        fill={"#302e31"}
        r={"35.8"}
        cy={"37.535"}
        cx={"37.535"}
      ></circle>

      <path
        fill={"#c4c2c4"}
        d={
          "M19.335 18.735c1.1-5.31 4.7-10.1 9.54-12.5-.842.855-1.86 1.51-2.64 2.44-3.19 3.44-4.63 8.42-3.75 13 1.11 6.99 7.68 12.7 14.8 12.6 5.52.247 10.9-2.93 13.6-7.72 5.78.196 11.4 3.18 14.7 7.97 1.69 2.5 3.01 5.43 3.1 8.48-1.07-4.05-3.76-7.65-7.43-9.68-3.55-2-7.91-2.51-11.8-1.33-4.88 1.4-8.91 5.39-10.3 10.3-1.18 3.91-.675 8.22 1.18 11.8-2.58 4.47-7.24 7.66-12.3 8.62-3.89.816-7.98.186-11.6-1.45 3.24.945 6.76 1.11 9.98-.035 4.32-1.43 7.89-4.9 9.46-9.18 1.74-4.66 1.08-10.2-1.85-14.2-2.19-3.15-5.64-5.37-9.39-6.16-1.19-.212-2.39-.308-3.59-.418-1.91-3.85-2.61-8.32-1.65-12.5z"
        }
      ></path>
    </svg>
  );
}

export default ObsIcon;
/* prettier-ignore-end */
