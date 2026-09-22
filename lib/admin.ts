import { sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
export async function requireAdmin(){const user=await getCurrentUser();if(!user||user.role!=="admin")return null;return user;}
export async function audit(adminId:string,action:string,targetType?:string,targetId?:string,details:Record<string,unknown>={},ip?:string){
 await sql`INSERT INTO admin_audit_logs(admin_user_id,action,target_type,target_id,details_json,ip_address) VALUES(${adminId},${action},${targetType??null},${targetId??null},${JSON.stringify(details)}::jsonb,${ip??null})`;
}