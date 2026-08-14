import { SignIn } from "@clerk/nextjs";

export default function Page() {
  return <div style={{display:"grid",placeItems:"center",minHeight:"60vh"}}><SignIn path="/sign-in" routing="path" signUpUrl="/sign-up" /></div>;
}
